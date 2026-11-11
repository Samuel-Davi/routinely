import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from '../common/request-context';
import { AuthService } from './auth.service';
import { ACCESS_COOKIE } from './cookies';

/**
 * Verifies the access token (httpOnly cookie, or `Authorization: Bearer` for tools and tests)
 * and runs the rest of the request inside a context that carries the user id. The id comes
 * only from the signed token: nothing in the body or query can set it.
 */
@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  constructor(private readonly auth: AuthService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE] ?? bearer;
    const userId = token ? this.auth.verifyAccessToken(token) : undefined;
    requestContext.run({ userId }, () => next());
  }
}
