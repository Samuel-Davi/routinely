import type { DemoLimitsService } from '../users/demo-limits.service';
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
  requiresTravel: false,
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
    { assertCanCreate: jest.fn().mockResolvedValue(undefined) } as unknown as DemoLimitsService,
  );
  return { service, repository, users };
}

describe('FixedCommitmentsService', () => {
  it('lists commitments with sorted weekdays', async () => {
    const { service } = setup();
    expect((await service.list())[0]).toMatchObject({ id: 'c1', daysOfWeek: [1, 3, 5] });
  });

  it('reports which commitments share time with each other', async () => {
    const pilates = {
      ...row,
      id: 'c2',
      title: 'Pilates',
      daysOfWeek: [1, 2],
      startTime: '18:30',
      endTime: '19:30',
    };
    const { service, repository } = setup();
    repository.findAll.mockResolvedValue([row, pilates]);
    const [first, second] = await service.list();
    expect(first?.overlapsWith).toEqual([{ id: 'c2', title: 'Pilates', daysOfWeek: [1] }]);
    expect(second?.overlapsWith).toEqual([{ id: 'c1', title: 'Academia', daysOfWeek: [1] }]);
    expect((await service.get('c1')).overlapsWith).toHaveLength(1);
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
