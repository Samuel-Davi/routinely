import type { FixedCommitment as FixedCommitmentRow } from '@prisma/client';
import type { FixedCommitmentInput } from '@routinely/shared';
import type { CurrentUser } from '../common/current-user';
import type { UsersRepository } from '../users/users.repository';
import type { FixedCommitmentsRepository } from './fixed-commitments.repository';
import { FixedCommitmentsService } from './fixed-commitments.service';

const now = new Date('2026-11-10T12:00:00.000Z');
const input: FixedCommitmentInput = {
  title: 'Academia',
  daysOfWeek: [5, 1, 3],
  startTime: '18:00',
  endTime: '19:00',
  category: 'HEALTH',
  color: 'green',
};
const row: FixedCommitmentRow = {
  id: 'c1',
  userId: 'user-1',
  ...input,
  createdAt: now,
  updatedAt: now,
};

function setup(existing: FixedCommitmentRow | null = row) {
  const repository = {
    findAll: jest.fn().mockResolvedValue(existing ? [existing] : []),
    findById: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue(row),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const users = { touchSchedule: jest.fn().mockResolvedValue(undefined) };
  const service = new FixedCommitmentsService(
    repository as unknown as FixedCommitmentsRepository,
    users as unknown as UsersRepository,
    { id: 'user-1' } as CurrentUser,
  );
  return { service, repository, users };
}

describe('FixedCommitmentsService', () => {
  it('lists commitments with sorted weekdays', async () => {
    const { service } = setup();
    expect((await service.list())[0]).toMatchObject({ id: 'c1', daysOfWeek: [1, 3, 5] });
  });

  it('flags a schedule change on create, update and delete', async () => {
    const { service, users, repository } = setup();
    await service.create(input);
    await service.update('c1', input);
    await service.remove('c1');
    expect(repository.create).toHaveBeenCalledWith('user-1', input);
    expect(repository.delete).toHaveBeenCalledWith('c1');
    expect(users.touchSchedule).toHaveBeenCalledTimes(3);
  });

  it('throws NOT_FOUND when the commitment does not exist', async () => {
    const { service, users } = setup(null);
    await expect(service.get('x')).rejects.toMatchObject({ status: 404 });
    await expect(service.update('x', input)).rejects.toMatchObject({ status: 404 });
    await expect(service.remove('x')).rejects.toMatchObject({ status: 404 });
    expect(users.touchSchedule).not.toHaveBeenCalled();
  });
});
