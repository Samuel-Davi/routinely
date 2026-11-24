import { Injectable } from '@nestjs/common';
import { utcToZonedParts, type DateString, type Today } from '@routinely/shared';
import { Clock } from '../common/clock';
import { CurrentUser } from '../common/current-user';
import { PreferencesService } from '../preferences/preferences.service';
import { buildToday, dayBounds } from './build-today';
import { IntegrationsRepository } from './integrations.repository';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly repository: IntegrationsRepository,
    private readonly preferences: PreferencesService,
    private readonly currentUser: CurrentUser,
    private readonly clock: Clock,
  ) {}

  /** The user's day (default: today in their timezone), as read by external assistants. */
  async today(date?: DateString): Promise<Today> {
    const userId = this.currentUser.id;
    const { timezone } = await this.preferences.getFor(userId);
    const day = date ?? utcToZonedParts(this.clock.now(), timezone).date;
    const bounds = dayBounds(day, timezone);
    const from = new Date(bounds.start);
    const to = new Date(bounds.end);
    const [routine, commitments, tasks] = await Promise.all([
      this.repository.activeRoutineDay(userId, from, to),
      this.repository.commitments(userId),
      this.repository.tasksDue(userId, from, to),
    ]);
    return buildToday({
      date: day,
      timezone,
      blocks: routine.blocks,
      commitments,
      tasks,
      routineNotice: routine.notice,
    });
  }
}
