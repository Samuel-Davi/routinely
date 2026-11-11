import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';

/** Write limits of the shared demo account, so a public demo cannot become a dumping ground. */
@Injectable()
export class DemoLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async assertCanCreate(userId: string, kind: 'task' | 'commitment'): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isDemo: true },
    });
    if (!user?.isDemo) return;
    const [count, max, label] =
      kind === 'task'
        ? [
            await this.prisma.task.count({ where: { userId } }),
            this.config.DEMO_MAX_TASKS,
            'tarefas',
          ]
        : [
            await this.prisma.fixedCommitment.count({ where: { userId } }),
            this.config.DEMO_MAX_COMMITMENTS,
            'compromissos',
          ];
    if (count >= max) {
      throw new AppError(
        'DEMO_LIMIT',
        `A conta demo aceita no máximo ${max} ${label}. Exclua alguma para criar outra (os dados voltam ao normal periodicamente).`,
        403,
      );
    }
  }
}
