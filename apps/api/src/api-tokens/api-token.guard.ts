import {
  applyDecorators,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { ApiTokenScope } from '@routinely/shared';
import type { Request } from 'express';
import { AppError } from '../common/app-error';
import { requestContext } from '../common/request-context';
import { RateLimiter } from '../auth/rate-limiter';
import { API_TOKEN_SCOPE } from './api-token-scope';
import { ApiTokensService } from './api-tokens.service';

/** Calls per token per minute on integration routes. */
export const API_TOKEN_RATE_LIMIT = 30;

/** One generic answer for every refusal: missing, malformed, unknown, revoked or out of scope. */
const invalidToken = () => AppError.unauthenticated('Token de integração inválido.');

/**
 * Accepts ONLY `Authorization: Bearer rtly_…` with `scope`; the session cookie is ignored.
 * On success the request runs as the token's owner, exactly like a session would (CurrentUser).
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly limiter = new RateLimiter(API_TOKEN_RATE_LIMIT, 60_000);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: ApiTokensService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<ApiTokenScope | undefined>(API_TOKEN_SCOPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const store = requestContext.getStore();
    if (!scope || !store) throw invalidToken();

    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const raw = /^Bearer (\S+)$/.exec(header)?.[1];
    // Whatever the session middleware found (a cookie, say) must not leak into this route.
    store.userId = undefined;
    if (!raw) throw invalidToken();

    const verified = await this.tokens.verify(raw, scope);
    if (!verified) throw invalidToken();
    if (!this.limiter.allow(verified.tokenId)) {
      throw AppError.tooManyRequests('Muitas chamadas com este token. Aguarde um minuto.');
    }
    store.userId = verified.userId;
    return true;
  }
}

/**
 * Marks a route as reachable with a personal access token of `scope` (and only with it). The
 * global `JwtAuthGuard` lets these routes through because `ApiTokenGuard` always runs after it.
 */
export const ApiTokenAuth = (scope: ApiTokenScope) =>
  applyDecorators(SetMetadata(API_TOKEN_SCOPE, scope), UseGuards(ApiTokenGuard), ApiBearerAuth());
