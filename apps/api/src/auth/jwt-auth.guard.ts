import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { requestContext } from '../common/request-context';
import { API_TOKEN_SCOPE } from '../api-tokens/api-token-scope';
import { IS_PUBLIC } from './public.decorator';

/**
 * Global guard: every route requires a verified session unless marked `@Public()`.
 * The token itself is verified earlier, by `AuthContextMiddleware`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    // Integration routes authenticate with a personal token instead: `ApiTokenAuth` pairs this
    // metadata with `ApiTokenGuard`, which runs next and refuses anything but a valid token.
    const tokenScope = this.reflector.getAllAndOverride<string | undefined>(API_TOKEN_SCOPE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (tokenScope) return true;
    if (!requestContext.getStore()?.userId) throw AppError.unauthenticated();
    return true;
  }
}
