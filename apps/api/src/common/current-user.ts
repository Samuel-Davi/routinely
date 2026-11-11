import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.module';

/**
 * Resolves the acting user. The MVP has no login, so it always returns the seed
 * user; when Supabase Auth is added this becomes request-scoped and reads the JWT.
 */
@Injectable()
export class CurrentUser {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get id(): string {
    return this.config.DEFAULT_USER_ID;
  }
}
