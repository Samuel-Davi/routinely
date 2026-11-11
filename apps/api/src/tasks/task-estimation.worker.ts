import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { TaskEstimator } from '../ai/estimate-task';
import { PreferencesService } from '../preferences/preferences.service';
import type { EstimationQueue } from './estimation-queue';
import { TasksRepository } from './tasks.repository';

/**
 * In-process estimation job (ADR-003). Estimates run one at a time to spare the
 * free-tier quota; the task row carries the job state the front end polls.
 */
@Injectable()
export class TaskEstimationWorker implements EstimationQueue, OnApplicationBootstrap {
  private readonly logger = new Logger(TaskEstimationWorker.name);
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly tasks: TasksRepository,
    private readonly estimator: TaskEstimator,
    private readonly preferences: PreferencesService,
  ) {}

  /** Picks up estimations left pending by a previous process. */
  async onApplicationBootstrap(): Promise<void> {
    const pending = await this.tasks.findPendingEstimations();
    for (const task of pending) this.enqueue(task.id);
    if (pending.length > 0) this.logger.log(`Resuming ${pending.length} pending estimation(s)`);
  }

  enqueue(taskId: string): void {
    this.tail = this.tail.then(() => this.run(taskId));
  }

  /** Resolves when every queued estimation has finished (used by tests). */
  idle(): Promise<void> {
    return this.tail;
  }

  private async run(taskId: string): Promise<void> {
    try {
      const task = await this.tasks.findByIdAnyUser(taskId);
      // Deleted, already estimated or manually overridden while waiting in the queue.
      if (!task || task.estimationStatus !== 'PENDING' || task.estimationSource === 'MANUAL')
        return;

      const { timezone } = await this.preferences.getFor(task.userId);
      const estimate = await this.estimator.estimate({
        userId: task.userId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        deadline: task.deadline,
        timezone,
      });

      const saved = await this.tasks.completeEstimation(task, {
        complexity: estimate.complexity,
        estimatedMinutes: estimate.estimatedMinutes,
        splittable: estimate.splittable,
        aiRationale: estimate.rationale,
        estimationSource: estimate.source,
      });
      // The task changed while the model was thinking: estimate the new content.
      if (!saved) this.enqueue(taskId);
    } catch (error) {
      this.logger.error(`Estimation failed for task ${taskId}: ${(error as Error).message}`);
      await this.tasks.failEstimation(taskId).catch(() => undefined);
    }
  }
}
