import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { requestContext } from '../common/request-context';
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
    if (!requestContext.getStore()?.userId) throw AppError.unauthenticated();
    return true;
  }
}
