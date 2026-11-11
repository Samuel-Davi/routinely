import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify, type Algorithm } from '@node-rs/argon2';
import type { AuthUser, LoginInput, RegisterInput } from '@routinely/shared';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { AuthRepository } from './auth.repository';
import type { SessionTokens } from './cookies';

/** argon2id with the OWASP-recommended minimum cost (19 MiB, 2 passes, 1 lane). */
// (`Algorithm` is an ambient const enum, so the value is written out: Argon2id = 2.)
const ARGON2 = { algorithm: 2 as Algorithm, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string): Promise<string> => hash(password, ARGON2);

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const INVALID_CREDENTIALS = 'E-mail ou senha incorretos.';

@Injectable()
export class AuthService {
  /** Verified against when the e-mail is unknown, so both cases cost the same time. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly repository: AuthRepository,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(input: RegisterInput): Promise<{ user: AuthUser; tokens: SessionTokens }> {
    if (await this.repository.findUserByEmail(input.email)) {
      // Deliberately generic: do not confirm which e-mails already have an account.
      throw new AppError(
        'REGISTRATION_FAILED',
        'Não foi possível concluir o cadastro com estes dados.',
        409,
      );
    }
    const user = await this.repository
      .createUser({
        email: input.email,
        passwordHash: await hashPassword(input.password),
        name: input.name?.trim() || input.email.split('@')[0] || 'Usuário',
      })
      .catch(() => {
        // Lost a race on the unique e-mail.
        throw new AppError(
          'REGISTRATION_FAILED',
          'Não foi possível concluir o cadastro com estes dados.',
          409,
        );
      });
    return { user: toAuthUser(user), tokens: await this.issue(user.id, randomUUID()) };
  }

  async login(input: LoginInput): Promise<{ user: AuthUser; tokens: SessionTokens }> {
    const user = await this.repository.findUserByEmail(input.email);
    const passwordHash = user?.passwordHash ?? (await this.getDummyHash());
    const ok = await verify(passwordHash, input.password).catch(() => false);
    if (!user || !user.passwordHash || !ok) throw AppError.unauthenticated(INVALID_CREDENTIALS);
    return { user: toAuthUser(user), tokens: await this.issue(user.id, randomUUID()) };
  }

  /**
   * Rotates the refresh token. A token that was already used and shows up again means it was
   * copied: the whole family (every token of that login) is revoked.
   */
  async refresh(
    refreshToken: string | undefined,
  ): Promise<{ user: AuthUser; tokens: SessionTokens }> {
    if (!refreshToken) throw AppError.unauthenticated();
    const stored = await this.repository.findRefreshToken(sha256(refreshToken));
    if (!stored) throw AppError.unauthenticated();
    if (stored.revokedAt) {
      await this.repository.revokeFamily(stored.familyId);
      throw AppError.unauthenticated();
    }
    if (stored.expiresAt <= this.clock.now()) throw AppError.unauthenticated();
    if (!(await this.repository.revokeToken(stored.id))) {
      await this.repository.revokeFamily(stored.familyId);
      throw AppError.unauthenticated();
    }
    const user = await this.repository.findUserById(stored.userId);
    if (!user) throw AppError.unauthenticated();
    void this.repository.deleteExpired(this.clock.now()).catch(() => undefined);
    return { user: toAuthUser(user), tokens: await this.issue(user.id, stored.familyId) };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.repository.findRefreshToken(sha256(refreshToken));
    if (stored) await this.repository.revokeFamily(stored.familyId);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw AppError.unauthenticated();
    return toAuthUser(user);
  }

  /** Subject of a valid access token, or `undefined`. Never throws. */
  verifyAccessToken(token: string): string | undefined {
    try {
      const payload = this.jwt.verify<{ sub?: string; typ?: string }>(token);
      return payload.typ === 'access' && payload.sub ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }

  private async issue(userId: string, familyId: string): Promise<SessionTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.repository.createRefreshToken({
      userId,
      familyId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(
        this.clock.now().getTime() + this.config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
      ),
    });
    const accessToken = this.jwt.sign(
      { sub: userId, typ: 'access' },
      { expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS },
    );
    return { accessToken, refreshToken };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
    return this.dummyHash;
  }
}

function toAuthUser(user: { id: string; email: string | null; name: string }): AuthUser {
  return { id: user.id, email: user.email, name: user.name };
}
