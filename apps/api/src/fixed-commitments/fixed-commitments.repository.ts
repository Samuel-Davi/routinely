import { Injectable } from '@nestjs/common';
import type { FixedCommitment as FixedCommitmentRow } from '@prisma/client';
import type { FixedCommitmentInput } from '@routinely/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FixedCommitmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string): Promise<FixedCommitmentRow[]> {
    return this.prisma.fixedCommitment.findMany({
      where: { userId },
      orderBy: [{ startTime: 'asc' }, { title: 'asc' }],
    });
  }

  findById(userId: string, id: string): Promise<FixedCommitmentRow | null> {
    return this.prisma.fixedCommitment.findFirst({ where: { id, userId } });
  }

  create(userId: string, data: FixedCommitmentInput): Promise<FixedCommitmentRow> {
    return this.prisma.fixedCommitment.create({ data: { ...data, userId } });
  }

  update(id: string, data: FixedCommitmentInput): Promise<FixedCommitmentRow> {
    return this.prisma.fixedCommitment.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fixedCommitment.delete({ where: { id } });
  }
}
