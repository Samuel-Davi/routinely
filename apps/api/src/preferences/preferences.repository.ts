import { Injectable } from '@nestjs/common';
import type { Preferences as PreferencesRow } from '@prisma/client';
import type { Preferences } from '@routinely/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PreferencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(userId: string): Promise<PreferencesRow | null> {
    return this.prisma.preferences.findUnique({ where: { userId } });
  }

  upsert(userId: string, data: Preferences): Promise<PreferencesRow> {
    return this.prisma.preferences.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId },
    });
  }
}
