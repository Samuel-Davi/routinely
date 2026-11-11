import { Injectable } from '@nestjs/common';
import type { Prisma, Task as TaskRow, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TaskCreateData = Pick<TaskRow, 'title' | 'description' | 'priority' | 'deadline'>;
export type TaskUpdateData = Prisma.TaskUncheckedUpdateInput;

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string, filter: { status?: TaskStatus } = {}): Promise<TaskRow[]> {
    return this.prisma.task.findMany({
      where: { userId, ...(filter.status ? { status: filter.status } : {}) },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findById(userId: string, id: string): Promise<TaskRow | null> {
    return this.prisma.task.findFirst({ where: { id, userId } });
  }

  /** Estimations left `PENDING` by a previous process (see ADR-003). */
  findPendingEstimations(): Promise<TaskRow[]> {
    return this.prisma.task.findMany({ where: { estimationStatus: 'PENDING' } });
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
