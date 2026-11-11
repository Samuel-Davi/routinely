import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Whether an AI call may be made now:
 *  - `ALLOWED`: go ahead (one use was taken from the user and from the global budget);
 *  - `DEMO`: the shared demo account never uses the AI;
 *  - `USER_LIMIT` / `GLOBAL_LIMIT`: the daily budget of this user / of everyone is spent.
 * Anything but `ALLOWED` means "use the heuristic": the app never stops working.
 */
export type AiDecision = 'ALLOWED' | 'DEMO' | 'USER_LIMIT' | 'GLOBAL_LIMIT';

export const AI_LIMIT_NOTICE = 'Limite diário de IA atingido. Rotina gerada sem IA.';
export const DEMO_NOTICE = 'Modo demo, sem IA. Rotina montada pelo planejador determinístico.';

export function noticeFor(decision: AiDecision): string | null {
  if (decision === 'DEMO') return DEMO_NOTICE;
  if (decision === 'USER_LIMIT' || decision === 'GLOBAL_LIMIT') return AI_LIMIT_NOTICE;
  return null;
}

/**
 * Daily budgets in the database (UTC day): per user (`AI_DAILY_LIMIT`) and global
 * (`AI_GLOBAL_DAILY_LIMIT`), which protect the shared free quota of the Gemini key.
 */
@Injectable()
export class AiQuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Takes one use. Atomic per counter: concurrent calls can never go over a limit. */
  async acquire(userId: string): Promise<AiDecision> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isDemo: true },
    });
    if (user?.isDemo) return 'DEMO';

    const day = this.clock.now().toISOString().slice(0, 10);
    // Global first: it is the scarcer resource. A user over the individual limit gives it back.
    if (!(await this.takeGlobal(day))) return 'GLOBAL_LIMIT';
    if (!(await this.takeUser(userId, day))) {
      await this.prisma.$executeRaw`
        UPDATE "AiGlobalUsage" SET "count" = "count" - 1 WHERE "day" = ${day} AND "count" > 0`;
      return 'USER_LIMIT';
    }
    return 'ALLOWED';
  }

  private async takeGlobal(day: string): Promise<boolean> {
    const limit = this.config.AI_GLOBAL_DAILY_LIMIT;
    if (limit <= 0) return false;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "AiGlobalUsage" ("day", "count") VALUES (${day}, 1)
      ON CONFLICT ("day") DO UPDATE SET "count" = "AiGlobalUsage"."count" + 1
        WHERE "AiGlobalUsage"."count" < ${limit}
      RETURNING "count"`;
    return rows.length > 0;
  }

  private async takeUser(userId: string, day: string): Promise<boolean> {
    const limit = this.config.AI_DAILY_LIMIT;
    if (limit <= 0) return false;
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "AiUsage" ("userId", "day", "count") VALUES (${userId}::uuid, ${day}, 1)
      ON CONFLICT ("userId", "day") DO UPDATE SET "count" = "AiUsage"."count" + 1
        WHERE "AiUsage"."count" < ${limit}
      RETURNING "count"`;
    return rows.length > 0;
  }
}
