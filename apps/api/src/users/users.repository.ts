import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  /** Marks that commitments/preferences changed, which may warrant a replan. */
  async touchSchedule(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { scheduleChangedAt: new Date() },
    });
  }
}
