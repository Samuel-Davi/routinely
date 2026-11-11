import { Inject, Injectable, type CanActivate } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { APP_CONFIG, type AppConfig } from '../config/config.module';

/**
 * Runs before body validation, so a closed signup answers the same generic 403 whatever is sent
 * (it reveals nothing about accounts or about what would have been valid).
 */
@Injectable()
export class RegistrationEnabledGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(): boolean {
    if (!this.config.REGISTRATION_ENABLED) {
      throw new AppError('REGISTRATION_DISABLED', 'O cadastro está indisponível.', 403);
    }
    return true;
  }
}
