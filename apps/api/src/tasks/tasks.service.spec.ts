import type { Task as TaskRow } from '@prisma/client';
import { AppError } from '../common/app-error';
import type { CurrentUser } from '../common/current-user';
import type { DemoLimitsService } from '../users/demo-limits.service';
import type { EstimationQueue } from './estimation-queue';
import type { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

const USER_ID = 'user-1';
const now = new Date('2026-11-10T12:00:00.000Z');

function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    userId: USER_ID,
    commitmentId: null,
    title: 'Relatório',
    description: 'Mensal',
    priority: 'MEDIUM',
    deadline: new Date('2026-11-13T22:00:00.000Z'),
    status: 'TODO',
    complexity: 2,
    estimatedMinutes: 60,
    splittable: false,
    aiRationale: 'Simples',
    estimationStatus: 'DONE',
    estimationSource: 'AI',
    planChangedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup(existing: TaskRow | null = taskRow()) {
  const repository = {
    findAll: jest.fn().mockResolvedValue(existing ? [existing] : []),
    findById: jest.fn().mockResolvedValue(existing),
    commitmentExists: jest.fn().mockImplementation(async (_u, id) => id === 'aaaa-own'),
    create: jest
      .fn()
      .mockImplementation(async (_userId, data) =>
        taskRow({ ...data, estimationStatus: 'PENDING' }),
      ),
    update: jest
      .fn()
      .mockImplementation(async (_id, data) => ({ ...taskRow(), ...existing, ...data })),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const queue: jest.Mocked<EstimationQueue> = { enqueue: jest.fn() };
  const service = new TasksService(
    repository as unknown as TasksRepository,
    { id: USER_ID } as CurrentUser,
    { assertCanCreate: jest.fn().mockResolvedValue(undefined) } as unknown as DemoLimitsService,
    queue,
  );
  return { service, repository, queue };
}

describe('TasksService', () => {
  it("links a task to the user's own commitment on create", async () => {
    const { service, repository } = setup();
    await service.create({
      title: 'Prova',
      description: '',
      priority: 'HIGH',
      deadline: '2026-11-20T12:00:00.000Z',
      commitmentId: 'aaaa-own',
    });
    expect(repository.create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ commitmentId: 'aaaa-own' }),
    );
  });

  it("rejects a commitment that is not the user's (create and update)", async () => {
    const { service, repository } = setup();
    await expect(
      service.create({
        title: 'X',
        description: '',
        priority: 'LOW',
        deadline: '2026-11-20T12:00:00.000Z',
        commitmentId: 'someone-elses',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.update('task-1', { commitmentId: 'someone-elses' }),
    ).rejects.toBeInstanceOf(AppError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('unlinks with null and flags the plan as changed when the link changes', async () => {
    const { service, repository } = setup(taskRow({ commitmentId: 'aaaa-own' }));
    await service.update('task-1', { commitmentId: null });
    expect(repository.update).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ commitmentId: null, planChangedAt: expect.any(Date) }),
    );
  });

  it('filters the list by commitment', async () => {
    const { service, repository } = setup();
    await service.list({ commitmentId: 'aaaa-own' });
    expect(repository.findAll).toHaveBeenCalledWith(USER_ID, { commitmentId: 'aaaa-own' });
  });

  it('lists tasks as DTOs with ISO dates', async () => {
    const { service, repository } = setup();
    const tasks = await service.list({ status: 'TODO' });
    expect(repository.findAll).toHaveBeenCalledWith(USER_ID, { status: 'TODO' });
    expect(tasks[0]).toMatchObject({ id: 'task-1', deadline: '2026-11-13T22:00:00.000Z' });
  });

  it('creates a task as PENDING and enqueues the AI estimate', async () => {
    const { service, repository, queue } = setup();
    const task = await service.create({
      title: 'Nova',
      description: '',
      priority: 'HIGH',
      deadline: '2026-11-20T12:00:00.000Z',
    });
    expect(repository.create).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ title: 'Nova', deadline: new Date('2026-11-20T12:00:00.000Z') }),
    );
    expect(task.estimationStatus).toBe('PENDING');
    expect(queue.enqueue).toHaveBeenCalledWith('task-1');
  });

  it('throws NOT_FOUND for a task of another user or a missing one', async () => {
    const { service } = setup(null);
    await expect(service.get('missing')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(service.update('missing', { title: 'x' })).rejects.toBeInstanceOf(AppError);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(AppError);
  });

  it('re-estimates when the content changes', async () => {
    const { service, repository, queue } = setup();
    await service.update('task-1', { title: 'Relatório anual' });
    expect(repository.update).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ title: 'Relatório anual', estimationStatus: 'PENDING' }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith('task-1');
  });

  it('does not re-estimate when nothing relevant changed', async () => {
    const { service, repository, queue } = setup();
    await service.update('task-1', { title: 'Relatório', status: 'DONE' });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(repository.update.mock.calls[0][1]).not.toHaveProperty('estimationStatus');
    expect(repository.update.mock.calls[0][1]).not.toHaveProperty('planChangedAt');
  });

  it('never overwrites a manual estimate with the AI', async () => {
    const { service, queue } = setup(taskRow({ estimationSource: 'MANUAL' }));
    await service.update('task-1', { title: 'Outro título' });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('applies a manual estimate override', async () => {
    const { service, repository, queue } = setup();
    const task = await service.update('task-1', {
      estimate: { complexity: 5, estimatedMinutes: 240, splittable: true },
    });
    expect(repository.update).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        complexity: 5,
        estimatedMinutes: 240,
        splittable: true,
        estimationSource: 'MANUAL',
        estimationStatus: 'DONE',
        planChangedAt: expect.any(Date),
      }),
    );
    expect(task.estimationSource).toBe('MANUAL');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it.each([
    ['deadline', { deadline: '2026-11-14T22:00:00.000Z' }],
    ['priority', { priority: 'URGENT' as const }],
  ])('marks the plan as changed when the %s changes', async (_label, patch) => {
    const { service, repository } = setup();
    await service.update('task-1', patch);
    expect(repository.update.mock.calls[0][1]).toHaveProperty('planChangedAt');
  });

  it('marks the plan as changed when a finished task is reopened', async () => {
    const { service, repository } = setup(taskRow({ status: 'DONE' }));
    await service.update('task-1', { status: 'TODO' });
    expect(repository.update.mock.calls[0][1]).toHaveProperty('planChangedAt');
  });

  it('re-estimates on demand, dropping the manual override', async () => {
    const { service, repository, queue } = setup(taskRow({ estimationSource: 'MANUAL' }));
    await service.reestimate('task-1');
    expect(repository.update).toHaveBeenCalledWith('task-1', {
      estimationStatus: 'PENDING',
      estimationSource: null,
    });
    expect(queue.enqueue).toHaveBeenCalledWith('task-1');
  });

  it('deletes a task', async () => {
    const { service, repository } = setup();
    await service.remove('task-1');
    expect(repository.delete).toHaveBeenCalledWith('task-1');
  });
});
