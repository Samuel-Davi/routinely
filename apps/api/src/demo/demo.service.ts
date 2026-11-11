import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  addDays,
  emailSchema,
  fromLocalDateTime,
  toLocalDateTime,
  type CommitmentCategory,
  type Priority,
} from '@routinely/shared';
import { hashPassword } from '../auth/auth.service';
import { Clock } from '../common/clock';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { PrismaService } from '../prisma/prisma.service';
import { RoutinesService } from '../routines/routines.service';

interface DemoCommitment {
  title: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  category: CommitmentCategory;
  color: string;
  requiresTravel?: boolean;
}

interface DemoTask {
  title: string;
  description: string;
  priority: Priority;
  /** Deadline: this many days from today, at `time` local. */
  inDays: number;
  time: string;
  minutes: number;
  complexity: number;
  splittable: boolean;
  commitment?: string;
}

/** Fictional but realistic: a student who also works part time. */
const COMMITMENTS: DemoCommitment[] = [
  {
    title: 'Estágio',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '12:00',
    category: 'WORK',
    color: 'blue',
  },
  {
    title: 'Estágio (tarde)',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '13:00',
    endTime: '16:30',
    category: 'WORK',
    color: 'blue',
  },
  {
    title: 'Faculdade: Banco de Dados',
    daysOfWeek: [2, 4],
    startTime: '19:00',
    endTime: '21:00',
    category: 'STUDY',
    color: 'purple',
    requiresTravel: true,
  },
  {
    title: 'Academia',
    daysOfWeek: [1, 3, 5],
    startTime: '17:30',
    endTime: '18:30',
    category: 'HEALTH',
    color: 'green',
  },
  {
    title: 'Curso de inglês',
    daysOfWeek: [6],
    startTime: '09:00',
    endTime: '11:00',
    category: 'STUDY',
    color: 'orange',
  },
];

const TASKS: DemoTask[] = [
  {
    title: 'Estudar para a prova de Algoritmos',
    description: 'Árvores, grafos e complexidade.',
    priority: 'URGENT',
    inDays: 3,
    time: '18:00',
    minutes: 240,
    complexity: 5,
    splittable: true,
  },
  {
    title: 'Trabalho de Banco de Dados',
    description: 'Modelagem e consultas do estudo de caso.',
    priority: 'HIGH',
    inDays: 4,
    time: '20:00',
    minutes: 180,
    complexity: 4,
    splittable: true,
    commitment: 'Faculdade: Banco de Dados',
  },
  {
    title: 'Revisar o pull request do projeto',
    description: 'Revisão de código do módulo de relatórios.',
    priority: 'MEDIUM',
    inDays: 5,
    time: '17:00',
    minutes: 90,
    complexity: 3,
    splittable: false,
  },
  {
    title: 'Escrever o relatório do estágio',
    description: 'Resumo das atividades do mês.',
    priority: 'MEDIUM',
    inDays: 6,
    time: '16:00',
    minutes: 120,
    complexity: 3,
    splittable: true,
  },
  {
    title: 'Organizar as finanças do mês',
    description: '',
    priority: 'LOW',
    inDays: 7,
    time: '21:00',
    minutes: 60,
    complexity: 1,
    splittable: false,
  },
  {
    title: 'Agendar consulta no dentista',
    description: '',
    priority: 'LOW',
    inDays: 7,
    time: '18:00',
    minutes: 15,
    complexity: 1,
    splittable: false,
  },
];

/**
 * The shared portfolio demo account. `reset()` is idempotent: it creates the account if needed,
 * wipes its data and recreates realistic fictional data plus an already generated routine.
 * The routine is built by the heuristic planner only: the demo never calls the AI.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly routines: RoutinesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async reset(): Promise<{ userId: string; tasks: number; commitments: number }> {
    const email = emailSchema.safeParse(this.config.DEMO_EMAIL ?? '');
    if (!email.success || !this.config.DEMO_PASSWORD) {
      throw new Error('Defina DEMO_EMAIL (e-mail válido) e DEMO_PASSWORD no ambiente.');
    }
    const timezone = this.config.DEFAULT_TIMEZONE;
    const user = await this.prisma.user.upsert({
      where: { email: email.data },
      update: { isDemo: true, passwordHash: await hashPassword(this.config.DEMO_PASSWORD) },
      create: {
        email: email.data,
        name: 'Conta demo',
        isDemo: true,
        passwordHash: await hashPassword(this.config.DEMO_PASSWORD),
      },
    });
    const userId = user.id;

    // Wipe in dependency order; cascades take the blocks along with their routines.
    await this.prisma.$transaction([
      this.prisma.routine.deleteMany({ where: { userId } }),
      this.prisma.task.deleteMany({ where: { userId } }),
      this.prisma.fixedCommitment.deleteMany({ where: { userId } }),
      this.prisma.estimateCache.deleteMany({ where: { userId } }),
      this.prisma.preferences.deleteMany({ where: { userId } }),
      this.prisma.aiUsage.deleteMany({ where: { userId } }),
    ]);

    await this.prisma.preferences.create({
      data: { userId, timezone, dayEnd: '22:00', travelMinutes: 30 },
    });
    const byTitle = new Map<string, string>();
    for (const commitment of COMMITMENTS) {
      const created = await this.prisma.fixedCommitment.create({ data: { ...commitment, userId } });
      byTitle.set(created.title, created.id);
    }
    const today = toLocalDateTime(this.clock.now(), timezone).slice(0, 10);
    for (const task of TASKS) {
      const date = addDays(today, task.inDays);
      await this.prisma.task.create({
        data: {
          userId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          deadline: new Date(fromLocalDateTime(`${date}T${task.time}`, timezone)),
          commitmentId: task.commitment ? (byTitle.get(task.commitment) ?? null) : null,
          complexity: task.complexity,
          estimatedMinutes: task.minutes,
          splittable: task.splittable,
          aiRationale: 'Estimativa de exemplo da conta demo (sem IA).',
          estimationStatus: 'DONE',
          estimationSource: 'HEURISTIC',
        },
      });
    }

    await this.routines.generateNow(userId);
    this.logger.log(
      `Demo account reset (${TASKS.length} tasks, ${COMMITMENTS.length} commitments)`,
    );
    return { userId, tasks: TASKS.length, commitments: COMMITMENTS.length };
  }
}
