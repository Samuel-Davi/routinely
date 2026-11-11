import { DEFAULT_PREFERENCES } from '@routinely/shared';
import type { CurrentUser } from '../common/current-user';
import type { AppConfig } from '../config/config.module';
import type { UsersRepository } from '../users/users.repository';
import type { PreferencesRepository } from './preferences.repository';
import { PreferencesService } from './preferences.service';

function setup(stored: object | null) {
  const repository = {
    find: jest.fn().mockResolvedValue(stored),
    upsert: jest
      .fn()
      .mockImplementation(async (userId, data) => ({ userId, ...data, updatedAt: new Date() })),
  };
  const users = { touchSchedule: jest.fn().mockResolvedValue(undefined) };
  const service = new PreferencesService(
    repository as unknown as PreferencesRepository,
    users as unknown as UsersRepository,
    { id: 'user-1' } as CurrentUser,
    { DEFAULT_TIMEZONE: 'America/Sao_Paulo' } as AppConfig,
  );
  return { service, repository, users };
}

describe('PreferencesService', () => {
  it('returns defaults (with the configured timezone) when nothing is stored', async () => {
    const { service } = setup(null);
    expect(await service.get()).toEqual({ ...DEFAULT_PREFERENCES, timezone: 'America/Sao_Paulo' });
  });

  it('returns stored preferences without internal columns', async () => {
    const { service } = setup({
      userId: 'user-1',
      ...DEFAULT_PREFERENCES,
      dayStart: '06:00',
      updatedAt: new Date(),
    });
    expect(await service.get()).toEqual({ ...DEFAULT_PREFERENCES, dayStart: '06:00' });
  });

  it('upserts and flags a schedule change', async () => {
    const { service, repository, users } = setup(null);
    const saved = await service.update({ ...DEFAULT_PREFERENCES, maxFocusBlockMinutes: 60 });
    expect(repository.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ maxFocusBlockMinutes: 60 }),
    );
    expect(saved.maxFocusBlockMinutes).toBe(60);
    expect(users.touchSchedule).toHaveBeenCalledWith('user-1');
  });
});
