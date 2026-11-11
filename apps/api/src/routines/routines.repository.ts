import { Injectable } from '@nestjs/common';
import type { Prisma, RoutineSource, RoutineTrigger } from '@prisma/client';
import type { RoutineDiff, UnscheduledTask } from '@routinely/shared';
import { PrismaService } from '../prisma/prisma.service';

const blockInclude = {
  task: { select: { id: true, title: true, priority: true, status: true, deadline: true } },
} satisfies Prisma.RoutineBlockInclude;

const routineInclude = {
  blocks: { include: blockInclude, orderBy: { start: 'asc' } },
} satisfies Prisma.RoutineInclude;

export type RoutineWithBlocks = Prisma.RoutineGetPayload<{ include: typeof routineInclude }>;
export type RoutineWithCount = Prisma.RoutineGetPayload<{
  include: { _count: { select: { blocks: true } } };
}>;
export type BlockWithTask = Prisma.RoutineBlockGetPayload<{ include: typeof blockInclude }>;
export type BlockWithRoutine = Prisma.RoutineBlockGetPayload<{
  include: typeof blockInclude & { routine: true };
}>;

export interface NewBlock {
  taskId: string;
  start: Date;
  end: Date;
  locked: boolean;
  completedAt: Date | null;
  rationale: string | null;
}

export interface ActivationData {
  source: RoutineSource;
  notice: string | null;
  diffSummary: RoutineDiff;
  unscheduled: UnscheduledTask[];
  blocks: NewBlock[];
  /** Open tasks that ended up with at least one block. */
  scheduledTaskIds: string[];
}

@Injectable()
export class RoutinesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(userId: string): Promise<RoutineWithBlocks | null> {
    return this.prisma.routine.findFirst({
      where: { userId, active: true, status: 'READY' },
      include: routineInclude,
    });
  }

  findById(userId: string, id: string): Promise<RoutineWithBlocks | null> {
    return this.prisma.routine.findFirst({ where: { id, userId }, include: routineInclude });
  }

  findPending(userId: string) {
    return this.prisma.routine.findFirst({ where: { userId, status: 'PENDING' } });
  }

  listHistory(userId: string): Promise<RoutineWithCount[]> {
    return this.prisma.routine.findMany({
      where: { userId },
      orderBy: { version: 'desc' },
      take: 50,
      include: { _count: { select: { blocks: true } } },
    });
  }

  /** Reserves the next version number as a PENDING job. */
  async createPending(
    userId: string,
    data: { trigger: RoutineTrigger; rangeStart: string; rangeEnd: string },
  ): Promise<RoutineWithCount> {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.routine.aggregate({ where: { userId }, _max: { version: true } });
      return tx.routine.create({
        data: { ...data, userId, version: (last._max.version ?? 0) + 1, status: 'PENDING' },
        include: { _count: { select: { blocks: true } } },
      });
    });
  }

  /** Writes the planned blocks and makes this version the active one, atomically. */
  async activate(userId: string, routineId: string, data: ActivationData): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.routine.updateMany({ where: { userId, active: true }, data: { active: false } });
      await tx.routineBlock.createMany({
        data: data.blocks.map((block) => ({ ...block, userId, routineId })),
      });
      await tx.routine.update({
        where: { id: routineId },
        data: {
          status: 'READY',
          active: true,
          source: data.source,
          notice: data.notice,
          diffSummary: data.diffSummary as unknown as Prisma.InputJsonValue,
          unscheduled: data.unscheduled as unknown as Prisma.InputJsonValue,
        },
      });
      // Task status mirrors the calendar: SCHEDULED when it has blocks, TODO otherwise.
      await tx.task.updateMany({
        where: { userId, status: 'TODO', id: { in: data.scheduledTaskIds } },
        data: { status: 'SCHEDULED' },
      });
      await tx.task.updateMany({
        where: { userId, status: 'SCHEDULED', id: { notIn: data.scheduledTaskIds } },
        data: { status: 'TODO' },
      });
    });
  }

  async markFailed(routineId: string, notice: string): Promise<void> {
    await this.prisma.routine.updateMany({
      where: { id: routineId, status: 'PENDING' },
      data: { status: 'FAILED', notice },
    });
  }

  /** Jobs interrupted by a restart can never finish (ADR-003). */
  async failOrphanedJobs(): Promise<number> {
    const result = await this.prisma.routine.updateMany({
      where: { status: 'PENDING' },
      data: { status: 'FAILED', notice: 'A geração foi interrompida. Tente novamente.' },
    });
    return result.count;
  }

  findBlock(userId: string, blockId: string): Promise<BlockWithRoutine | null> {
    return this.prisma.routineBlock.findFirst({
      where: { id: blockId, userId },
      include: { ...blockInclude, routine: true },
    });
  }

  findSiblingBlocks(routineId: string, exceptBlockId: string) {
    return this.prisma.routineBlock.findMany({
      where: { routineId, id: { not: exceptBlockId } },
      select: { start: true, end: true },
    });
  }

  updateBlock(
    blockId: string,
    data: Prisma.RoutineBlockUncheckedUpdateInput,
  ): Promise<BlockWithTask> {
    return this.prisma.routineBlock.update({
      where: { id: blockId },
      data,
      include: blockInclude,
    });
  }

  countIncompleteBlocks(routineId: string, taskId: string): Promise<number> {
    return this.prisma.routineBlock.count({ where: { routineId, taskId, completedAt: null } });
  }

  countOverdueBlocks(routineId: string, now: Date): Promise<number> {
    return this.prisma.routineBlock.count({
      where: { routineId, end: { lt: now }, completedAt: null, task: { status: { not: 'DONE' } } },
    });
  }

  countNewTasks(userId: string, routineId: string, since: Date): Promise<number> {
    return this.prisma.task.count({
      where: {
        userId,
        status: { not: 'DONE' },
        estimationStatus: 'DONE',
        createdAt: { gt: since },
        blocks: { none: { routineId } },
      },
    });
  }

  countChangedTasks(userId: string, since: Date): Promise<number> {
    return this.prisma.task.count({
      where: {
        userId,
        status: { not: 'DONE' },
        estimationStatus: 'DONE',
        createdAt: { lte: since },
        planChangedAt: { gt: since },
      },
    });
  }
}
