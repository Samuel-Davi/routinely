import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { ApiToken as ApiTokenRow } from '@prisma/client';
import {
  API_TOKEN_PREFIX,
  apiTokenScopeSchema,
  type ApiToken,
  type ApiTokenScope,
  type CreatedApiToken,
} from '@routinely/shared';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { generateApiToken, hashApiToken, sameHash } from './api-token.crypto';
import { ApiTokensRepository } from './api-tokens.repository';

/** `lastUsedAt` is refreshed at most this often, so polling does not write on every call. */
const TOUCH_INTERVAL_MS = 60_000;

export function toApiTokenDto(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    label: row.label,
    prefix: row.prefix,
    scopes: row.scopes.flatMap((scope) => {
      const parsed = apiTokenScopeSchema.safeParse(scope);
      return parsed.success ? [parsed.data] : [];
    }),
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class ApiTokensService {
  private readonly logger = new Logger(ApiTokensService.name);

  constructor(
    private readonly repository: ApiTokensRepository,
    private readonly clock: Clock,
  ) {}

  /** Creates a read-only token. The plain token is in the result and nowhere else. */
  async create(userId: string, label: string): Promise<CreatedApiToken> {
    const user = await this.repository.findUser(userId);
    if (user?.isDemo) {
      throw new AppError(
        'DEMO_FORBIDDEN',
        'A conta demo é compartilhada e não pode criar tokens.',
        HttpStatus.FORBIDDEN,
      );
    }
    const { token, prefix, tokenHash } = generateApiToken();
    const row = await this.repository.create(userId, {
      label,
      prefix,
      tokenHash,
      scopes: ['read:today'],
    });
    return { ...toApiTokenDto(row), token };
  }

  /** For the CLI, which has no session to read the user from. */
  async userIdForEmail(email: string): Promise<string> {
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    if (!user) throw AppError.notFound('Usuário');
    return user.id;
  }

  async list(userId: string): Promise<ApiToken[]> {
    return (await this.repository.list(userId)).map(toApiTokenDto);
  }

  async revoke(userId: string, id: string): Promise<void> {
    if (!(await this.repository.revoke(userId, id))) throw AppError.notFound('Token');
  }

  /**
   * The owner of a valid, unrevoked token that has `scope`; `null` otherwise. Callers answer
   * every `null` with the same generic 401, so nobody learns *why* a token was refused.
   */
  async verify(
    raw: string,
    scope: ApiTokenScope,
  ): Promise<{ tokenId: string; userId: string } | null> {
    if (!raw.startsWith(API_TOKEN_PREFIX)) return null;
    const tokenHash = hashApiToken(raw);
    const row = await this.repository.findByHash(tokenHash);
    if (!row || !sameHash(row.tokenHash, tokenHash)) return null;
    if (row.revokedAt || !row.scopes.includes(scope)) return null;

    const now = this.clock.now();
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= TOUCH_INTERVAL_MS) {
      // Bookkeeping only: never fail or slow down the request because of it.
      this.repository.touch(row.id, now).catch(() => {
        this.logger.warn('Could not update the token lastUsedAt');
      });
    }
    return { tokenId: row.id, userId: row.userId };
  }
}
