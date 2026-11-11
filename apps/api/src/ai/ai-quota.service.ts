import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Per-user daily budget of AI uses (UTC day). It protects the shared free quota of the
 * Gemini key: when a user runs out, the app keeps working with the heuristic.
 */
@Injectable()
export class AiQuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Takes one use. Atomic: concurrent calls can never go over the limit. */
  async consume(userId: string): Promise<boolean> {
    const limit = this.config.AI_DAILY_LIMIT;
    if (limit <= 0) return false;
    const day = this.clock.now().toISOString().slice(0, 10);
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "AiUsage" ("userId", "day", "count") VALUES (${userId}::uuid, ${day}, 1)
      ON CONFLICT ("userId", "day") DO UPDATE SET "count" = "AiUsage"."count" + 1
        WHERE "AiUsage"."count" < ${limit}
      RETURNING "count"`;
    return rows.length > 0;
  }
}
