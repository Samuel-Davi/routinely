import { Inject, Injectable } from '@nestjs/common';
import type { Task as TaskRow } from '@prisma/client';
import type { CreateTaskInput, Task, TaskStatus, UpdateTaskInput } from '@routinely/shared';
import { AppError } from '../common/app-error';
import { CurrentUser } from '../common/current-user';
import { DemoLimitsService } from '../users/demo-limits.service';
import { ESTIMATION_QUEUE, type EstimationQueue } from './estimation-queue';
import { toTaskDto } from './task.mapper';
import { TasksRepository, type TaskUpdateData } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(
    private readonly repository: TasksRepository,
    private readonly currentUser: CurrentUser,
    private readonly demoLimits: DemoLimitsService,
    @Inject(ESTIMATION_QUEUE) private readonly estimationQueue: EstimationQueue,
  ) {}

  async list(filter: { status?: TaskStatus; commitmentId?: string } = {}): Promise<Task[]> {
    const rows = await this.repository.findAll(this.currentUser.id, filter);
    return rows.map(toTaskDto);
  }

  async get(id: string): Promise<Task> {
    return toTaskDto(await this.findOrThrow(id));
  }

  /** Creates the task and asks the AI for an estimate in the background. */
  async create(input: CreateTaskInput): Promise<Task> {
    await this.demoLimits.assertCanCreate(this.currentUser.id, 'task');
    await this.assertCommitment(input.commitmentId);
    const row = await this.repository.create(this.currentUser.id, {
      commitmentId: input.commitmentId ?? null,
      title: input.title,
      description: input.description,
      priority: input.priority,
      deadline: new Date(input.deadline),
    });
    this.estimationQueue.enqueue(row.id);
    return toTaskDto(row);
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const current = await this.findOrThrow(id);
    const data: TaskUpdateData = {};
    let affectsPlan = false;
    let needsEstimate = false;

    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.deadline !== undefined) data.deadline = new Date(input.deadline);
    if (input.status !== undefined) data.status = input.status;
    if (input.commitmentId !== undefined) {
      await this.assertCommitment(input.commitmentId);
      data.commitmentId = input.commitmentId;
      if (input.commitmentId !== current.commitmentId) affectsPlan = true;
    }

    const contentChanged =
      (input.title !== undefined && input.title !== current.title) ||
      (input.description !== undefined && input.description !== current.description) ||
      (input.priority !== undefined && input.priority !== current.priority);
    if (input.priority !== undefined && input.priority !== current.priority) affectsPlan = true;
    if (input.deadline !== undefined && data.deadline?.valueOf() !== current.deadline.valueOf()) {
      affectsPlan = true;
    }
    // Reopening a finished task puts it back in the planning pool.
    if (current.status === 'DONE' && input.status !== undefined && input.status !== 'DONE') {
      affectsPlan = true;
    }

    if (input.estimate) {
      // Manual override always wins over the AI (ADR-007).
      Object.assign(data, {
        complexity: input.estimate.complexity,
        estimatedMinutes: input.estimate.estimatedMinutes,
        splittable: input.estimate.splittable,
        aiRationale: null,
        estimationStatus: 'DONE',
        estimationSource: 'MANUAL',
      } satisfies TaskUpdateData);
      affectsPlan = true;
    } else if (contentChanged && current.estimationSource !== 'MANUAL') {
      data.estimationStatus = 'PENDING';
      needsEstimate = true;
    }

    if (affectsPlan) data.planChangedAt = new Date();
    const row = await this.repository.update(id, data);
    if (needsEstimate) this.estimationQueue.enqueue(row.id);
    return toTaskDto(row);
  }

  /** Discards any manual override and asks the AI again. */
  async reestimate(id: string): Promise<Task> {
    await this.findOrThrow(id);
    const row = await this.repository.update(id, {
      estimationStatus: 'PENDING',
      estimationSource: null,
    });
    this.estimationQueue.enqueue(row.id);
    return toTaskDto(row);
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.repository.delete(id);
  }

  /** A task can only point at a commitment of the same user (never trust ids from the body). */
  private async assertCommitment(commitmentId: string | null | undefined): Promise<void> {
    if (!commitmentId) return;
    if (!(await this.repository.commitmentExists(this.currentUser.id, commitmentId))) {
      throw AppError.notFound('Compromisso');
    }
  }

  private async findOrThrow(id: string): Promise<TaskRow> {
    const row = await this.repository.findById(this.currentUser.id, id);
    if (!row) throw AppError.notFound('Tarefa');
    return row;
  }
}
