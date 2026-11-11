import type { Task as TaskRow } from '@prisma/client';
import { DEFAULT_PREFERENCES } from '@routinely/shared';
import type { TaskEstimator } from '../ai/estimate-task';
import type { AppConfig } from '../config/config.module';
import type { PreferencesService } from '../preferences/preferences.service';
import { TaskEstimationWorker } from './task-estimation.worker';
import type { TasksRepository } from './tasks.repository';

const task = {
  id: 'task-1',
  userId: 'user-1',
  title: 'Relatório',
  description: '',
  priority: 'MEDIUM',
  deadline: new Date('2026-11-13T22:00:00.000Z'),
  estimationStatus: 'PENDING',
  estimationSource: null,
} as TaskRow;
const estimate = {
  complexity: 2,
  estimatedMinutes: 60,
  splittable: false,
  rationale: 'ok',
  source: 'AI',
  cached: false,
};

function setup(row: TaskRow | null = task) {
  const tasks = {
    findByIdAnyUser: jest.fn().mockResolvedValue(row),
    findPendingEstimations: jest.fn().mockResolvedValue(row ? [row] : []),
    completeEstimation: jest.fn().mockResolvedValue(true),
    failEstimation: jest.fn().mockResolvedValue(undefined),
  };
  const estimator = { estimate: jest.fn().mockResolvedValue(estimate) };
  const worker = new TaskEstimationWorker(
    tasks as unknown as TasksRepository,
    estimator as unknown as TaskEstimator,
    { getFor: jest.fn().mockResolvedValue(DEFAULT_PREFERENCES) } as unknown as PreferencesService,
    { BACKGROUND_JOBS_ENABLED: true } as AppConfig,
  );
  return { worker, tasks, estimator };
}

describe('TaskEstimationWorker', () => {
  it('estimates a pending task and stores the result', async () => {
    const { worker, tasks, estimator } = setup();
    worker.enqueue('task-1');
    await worker.idle();
    expect(estimator.estimate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Relatório', timezone: 'America/Manaus', userId: 'user-1' }),
    );
    expect(tasks.completeEstimation).toHaveBeenCalledWith(task, {
      complexity: 2,
      estimatedMinutes: 60,
      splittable: false,
      aiRationale: 'ok',
      estimationSource: 'AI',
    });
  });

  it.each([
    ['deleted', null],
    ['already estimated', { ...task, estimationStatus: 'DONE' } as TaskRow],
    ['manually overridden', { ...task, estimationSource: 'MANUAL' } as TaskRow],
  ])('skips a %s task', async (_label, row) => {
    const { worker, estimator } = setup(row);
    worker.enqueue('task-1');
    await worker.idle();
    expect(estimator.estimate).not.toHaveBeenCalled();
  });

  it('re-estimates when the task changed while the model was answering', async () => {
    const { worker, tasks, estimator } = setup();
    tasks.completeEstimation.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    worker.enqueue('task-1');
    await worker.idle();
    await worker.idle();
    expect(estimator.estimate).toHaveBeenCalledTimes(2);
  });

  it('marks the estimation as FAILED on an unexpected error and keeps the queue alive', async () => {
    const { worker, tasks, estimator } = setup();
    estimator.estimate.mockRejectedValueOnce(new Error('db down'));
    worker.enqueue('task-1');
    worker.enqueue('task-1');
    await worker.idle();
    expect(tasks.failEstimation).toHaveBeenCalledWith('task-1');
    expect(estimator.estimate).toHaveBeenCalledTimes(2);
  });

  it('resumes pending estimations on boot', async () => {
    const { worker, estimator } = setup();
    await worker.onApplicationBootstrap();
    await worker.idle();
    expect(estimator.estimate).toHaveBeenCalledTimes(1);
  });
});
