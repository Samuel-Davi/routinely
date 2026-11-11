import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from './app-error';
import { requestContext } from './request-context';

/**
 * The authenticated user of the current request, taken from the verified access token (see
 * `AuthContextMiddleware`). Background jobs must receive the user id explicitly instead.
 */
@Injectable()
export class CurrentUser {
  get id(): string {
    const userId = requestContext.getStore()?.userId;
    if (!userId) {
      throw new AppError('UNAUTHENTICATED', 'Faça login para continuar.', HttpStatus.UNAUTHORIZED);
    }
    return userId;
  }
}
