import { Inject, Injectable } from '@nestjs/common';
import type { Preferences as PreferencesRow } from '@prisma/client';
import { DEFAULT_PREFERENCES, type Preferences } from '@routinely/shared';
import { CurrentUser } from '../common/current-user';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { UsersRepository } from '../users/users.repository';
import { PreferencesRepository } from './preferences.repository';

export function toPreferencesDto(row: PreferencesRow): Preferences {
  return {
    dayStart: row.dayStart,
    dayEnd: row.dayEnd,
    maxFocusBlockMinutes: row.maxFocusBlockMinutes,
    minBreakMinutes: row.minBreakMinutes,
    lunchStart: row.lunchStart,
    lunchEnd: row.lunchEnd,
    travelMinutes: row.travelMinutes,
    timezone: row.timezone,
  };
}

@Injectable()
export class PreferencesService {
  constructor(
    private readonly repository: PreferencesRepository,
    private readonly users: UsersRepository,
    private readonly currentUser: CurrentUser,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Stored preferences, or the defaults when the user never saved any. */
  async get(): Promise<Preferences> {
    return this.getFor(this.currentUser.id);
  }

  /** Same, for an explicit user: background jobs have no request to read the user from. */
  async getFor(userId: string): Promise<Preferences> {
    const row = await this.repository.find(userId);
    return row
      ? toPreferencesDto(row)
      : { ...DEFAULT_PREFERENCES, timezone: this.config.DEFAULT_TIMEZONE };
  }

  async update(input: Preferences): Promise<Preferences> {
    const row = await this.repository.upsert(this.currentUser.id, input);
    await this.users.touchSchedule(this.currentUser.id);
    return toPreferencesDto(row);
  }
}
