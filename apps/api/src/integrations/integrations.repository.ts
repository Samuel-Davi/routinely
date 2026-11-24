import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Read-only queries for integrations. Every query is scoped to `userId`. */
@Injectable()
export class IntegrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async activeRoutineDay(userId: string, from: Date, to: Date) {
    const routine = await this.prisma.routine.findFirst({
      where: { userId, active: true, status: 'READY' },
      select: {
        notice: true,
        blocks: {
          where: { userId, start: { lt: to }, end: { gt: from } },
          orderBy: { start: 'asc' },
          select: {
            start: true,
            end: true,
            locked: true,
            completedAt: true,
            task: { select: { title: true, priority: true } },
          },
        },
      },
    });
    return routine ?? { notice: null, blocks: [] };
  }

  commitments(userId: string) {
    return this.prisma.fixedCommitment.findMany({
      where: { userId },
      select: { title: true, daysOfWeek: true, date: true, startTime: true, endTime: true },
    });
  }

  tasksDue(userId: string, from: Date, to: Date) {
    return this.prisma.task.findMany({
      where: { userId, deadline: { gte: from, lt: to } },
      orderBy: { deadline: 'asc' },
      select: { title: true, deadline: true, priority: true, status: true },
    });
  }
}
