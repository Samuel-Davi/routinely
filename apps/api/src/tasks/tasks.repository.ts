import { Injectable } from '@nestjs/common';
import type { Prisma, Task as TaskRow, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TaskBlockMinutes } from './task.mapper';

export type TaskCreateData = Pick<TaskRow, 'title' | 'description' | 'priority' | 'deadline'> &
  Partial<Pick<TaskRow, 'commitmentId'>>;
export type TaskUpdateData = Prisma.TaskUncheckedUpdateInput;

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    userId: string,
    filter: { status?: TaskStatus; commitmentId?: string } = {},
  ): Promise<TaskRow[]> {
    return this.prisma.task.findMany({
      where: {
        userId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.commitmentId ? { commitmentId: filter.commitmentId } : {}),
      },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Done and total block minutes per task in the user's active routine. Completed blocks
   * are carried over on replan, so the active routine holds the whole history.
   */
  async blockMinutes(userId: string, taskIds: string[]): Promise<Map<string, TaskBlockMinutes>> {
    const minutes = new Map<string, TaskBlockMinutes>();
    if (taskIds.length === 0) return minutes;
    const blocks = await this.prisma.routineBlock.findMany({
      where: { userId, taskId: { in: taskIds }, routine: { active: true, status: 'READY' } },
      select: { taskId: true, start: true, end: true, completedAt: true },
    });
    for (const block of blocks) {
      const length = Math.round((block.end.valueOf() - block.start.valueOf()) / 60_000);
      const current = minutes.get(block.taskId) ?? { completed: 0, scheduled: 0 };
      current.scheduled += length;
      if (block.completedAt) current.completed += length;
      minutes.set(block.taskId, current);
    }
    return minutes;
  }

  /** Whether the commitment exists and belongs to the user. */
  async commitmentExists(userId: string, id: string): Promise<boolean> {
    return (await this.prisma.fixedCommitment.count({ where: { id, userId } })) > 0;
  }

  findById(userId: string, id: string): Promise<TaskRow | null> {
    return this.prisma.task.findFirst({ where: { id, userId } });
  }

  /** Estimations left `PENDING` by a previous process (see ADR-003). */
  findPendingEstimations(): Promise<TaskRow[]> {
    return this.prisma.task.findMany({ where: { estimationStatus: 'PENDING' } });
  }

  findByIdAnyUser(id: string): Promise<TaskRow | null> {
    return this.prisma.task.findUnique({ where: { id } });
  }

  /**
   * Stores an estimate only if the task is still waiting for it and its content
   * did not change meanwhile. Returns false only when the write was skipped and
   * the task is still pending (its content changed), i.e. it must be re-estimated.
   */
  async completeEstimation(
    snapshot: Pick<TaskRow, 'id' | 'title' | 'description' | 'priority'>,
    estimate: Pick<
      TaskRow,
      'complexity' | 'estimatedMinutes' | 'splittable' | 'aiRationale' | 'estimationSource'
    >,
  ): Promise<boolean> {
    const result = await this.prisma.task.updateMany({
      where: {
        id: snapshot.id,
        estimationStatus: 'PENDING',
        title: snapshot.title,
        description: snapshot.description,
        priority: snapshot.priority,
      },
      data: { ...estimate, estimationStatus: 'DONE', planChangedAt: new Date() },
    });
    if (result.count > 0) return true;
    // Skipped: only worth retrying if the task still exists and is still pending.
    const current = await this.prisma.task.findUnique({ where: { id: snapshot.id } });
    return !(current && current.estimationStatus === 'PENDING');
  }

  async failEstimation(id: string): Promise<void> {
    await this.prisma.task.updateMany({
      where: { id, estimationStatus: 'PENDING' },
      data: { estimationStatus: 'FAILED' },
    });
  }

  create(userId: string, data: TaskCreateData): Promise<TaskRow> {
    return this.prisma.task.create({ data: { ...data, userId } });
  }

  update(id: string, data: TaskUpdateData): Promise<TaskRow> {
    return this.prisma.task.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.task.delete({ where: { id } });
  }
}
