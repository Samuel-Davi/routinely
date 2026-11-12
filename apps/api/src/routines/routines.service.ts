import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  checkPlacement,
  utcToZonedParts,
  type GenerateRoutineInput,
  type MoveBlockInput,
  type Preferences,
  type ReplanReason,
  type ReplanSuggestion,
  type Routine,
  type RoutineBlock,
  type RoutineSummary,
  type RoutineTrigger,
  type UnscheduledTask,
} from '@routinely/shared';
import { AiQuotaService, noticeFor } from '../ai/ai-quota.service';
import { RoutineProposer, type RoutinePlanningInput } from '../ai/generate-routine';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { CurrentUser } from '../common/current-user';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import { FixedCommitmentsRepository } from '../fixed-commitments/fixed-commitments.repository';
import { PreferencesService } from '../preferences/preferences.service';
import { TasksRepository } from '../tasks/tasks.repository';
import { UsersRepository } from '../users/users.repository';
import {
  compareTasks,
  diffBlocks,
  planRoutine,
  scheduleHeuristic,
  type EngineBlock,
  type EngineTask,
  type PlanningContext,
} from './engine';
import {
  resolveRange,
  selectCarriedBlocks,
  toEngineTasks,
  type PlanningRange,
} from './planning-input';
import { toBlockDto, toRoutineDto, toRoutineSummaryDto } from './routine.mapper';
import { buildPlanningInput, buildProposeFn } from './ai-request';
import { RoutinesRepository, type NewBlock, type RoutineWithBlocks } from './routines.repository';

/** An interrupted generation is resumed at most this many times. */
export const MAX_RESUMES = 2;

@Injectable()
export class RoutinesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RoutinesService.name);
  private readonly jobs = new Set<Promise<void>>();

  constructor(
    private readonly repository: RoutinesRepository,
    private readonly tasks: TasksRepository,
    private readonly commitments: FixedCommitmentsRepository,
    private readonly preferences: PreferencesService,
    private readonly users: UsersRepository,
    private readonly proposer: RoutineProposer,
    private readonly currentUser: CurrentUser,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly quota: AiQuotaService,
  ) {}

  /**
   * Generations interrupted by a restart are resumed (re-run from the start; the plan is
   * deterministic given the data). A job that keeps being interrupted is given up after
   * `MAX_RESUMES`, so a generation that crashes the process cannot cause a restart loop.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.BACKGROUND_JOBS_ENABLED) return;
    for (const job of await this.repository.findInterruptedJobs()) {
      if (job.resumeCount >= MAX_RESUMES) {
        await this.repository.markFailed(job.id, 'A geração foi interrompida. Tente novamente.');
        this.logger.warn(`Routine job ${job.id} gave up after ${job.resumeCount} resume(s)`);
        continue;
      }
      await this.repository.countResume(job.id);
      this.logger.warn(`Resuming interrupted routine job ${job.id}`);
      this.track(
        this.runJob(job.userId, job.id, { rangeStart: job.rangeStart, rangeEnd: job.rangeEnd }),
      );
    }
  }

  private track(promise: Promise<void>): void {
    const job = promise.finally(() => this.jobs.delete(job));
    this.jobs.add(job);
  }

  /** Resolves when every running generation job has finished (used by tests). */
  async idle(): Promise<void> {
    await Promise.all([...this.jobs]);
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  async getActive(): Promise<Routine | null> {
    const routine = await this.repository.findActive(this.currentUser.id);
    return routine ? toRoutineDto(routine) : null;
  }

  async get(id: string): Promise<Routine> {
    const routine = await this.repository.findById(this.currentUser.id, id);
    if (!routine) throw AppError.notFound('Rotina');
    return toRoutineDto(routine);
  }

  async history(): Promise<RoutineSummary[]> {
    const routines = await this.repository.listHistory(this.currentUser.id);
    return routines.map(toRoutineSummaryDto);
  }

  /** Whether the active routine is stale: overdue blocks, new/changed tasks or schedule changes. */
  async replanSuggestion(): Promise<ReplanSuggestion> {
    const userId = this.currentUser.id;
    const routine = await this.repository.findActive(userId);
    if (!routine) return { needsReplan: false, reasons: [] };

    const since = routine.createdAt;
    const [overdue, added, changed, user] = await Promise.all([
      this.repository.countOverdueBlocks(routine.id, this.clock.now()),
      this.repository.countNewTasks(userId, routine.id, since),
      this.repository.countChangedTasks(userId, since),
      this.users.findById(userId),
    ]);
    const counts: [ReplanReason, number][] = [
      ['OVERDUE_BLOCK', overdue],
      ['NEW_TASK', added],
      ['TASK_CHANGED', changed],
      ['SCHEDULE_CHANGED', user && user.scheduleChangedAt > since ? 1 : 0],
    ];
    const reasons = counts
      .filter(([, count]) => count > 0)
      .map(([code, count]) => ({ code, count }));
    return { needsReplan: reasons.length > 0, reasons };
  }

  // ─── Generation ────────────────────────────────────────────────────────────

  /** Plans the given week (optionally up to the last deadline). Runs in the background. */
  async generate(input: GenerateRoutineInput): Promise<RoutineSummary> {
    const prefs = await this.preferences.get();
    const today = utcToZonedParts(this.clock.now(), prefs.timezone).date;
    const openTasks = await this.openTasks();
    const range = resolveRange(input.weekStart ?? today, {
      untilLastDeadline: input.untilLastDeadline,
      deadlines: openTasks.map((task) => task.deadline),
      timezone: prefs.timezone,
    });
    if (range.rangeEnd < today) {
      throw new AppError(
        'RANGE_IN_PAST',
        'Não é possível gerar rotina para uma semana que já passou.',
      );
    }
    return this.startJob('GENERATE', range, input.instruction);
  }

  /** Regenerates only the future of the active routine, keeping locked and completed blocks. */
  async replan(instruction?: string): Promise<RoutineSummary> {
    const prefs = await this.preferences.get();
    const today = utcToZonedParts(this.clock.now(), prefs.timezone).date;
    const active = await this.repository.findActive(this.currentUser.id);
    const currentWeek = resolveRange(today, {
      untilLastDeadline: false,
      deadlines: [],
      timezone: prefs.timezone,
    });
    if (!active) return this.startJob('GENERATE', currentWeek, instruction);
    const range: PlanningRange = {
      rangeStart:
        active.rangeStart < currentWeek.rangeStart ? active.rangeStart : currentWeek.rangeStart,
      rangeEnd: active.rangeEnd > currentWeek.rangeEnd ? active.rangeEnd : currentWeek.rangeEnd,
    };
    return this.startJob('REPLAN', range, instruction);
  }

  private async startJob(
    trigger: RoutineTrigger,
    range: PlanningRange,
    instruction?: string,
  ): Promise<RoutineSummary> {
    const userId = this.currentUser.id;
    if (await this.repository.findPending(userId)) {
      throw AppError.conflict('GENERATION_IN_PROGRESS', 'Já existe uma rotina sendo gerada.');
    }
    const routine = await this.repository.createPending(userId, { trigger, ...range });
    this.track(this.runJob(userId, routine.id, range, instruction));
    return toRoutineSummaryDto(routine);
  }

  /**
   * Generates and waits (no request involved): used by the demo reset. The AI policy is the same
   * as for any job, so the demo account gets the heuristic planner.
   */
  async generateNow(userId: string): Promise<void> {
    const prefs = await this.preferences.getFor(userId);
    const today = utcToZonedParts(this.clock.now(), prefs.timezone).date;
    const tasks = (await this.tasks.findAll(userId)).filter((task) => task.status !== 'DONE');
    const range = resolveRange(today, {
      untilLastDeadline: true,
      deadlines: tasks.map((task) => task.deadline),
      timezone: prefs.timezone,
    });
    const routine = await this.repository.createPending(userId, { trigger: 'GENERATE', ...range });
    await this.runJob(userId, routine.id, range);
  }

  /** Starts a new generation with the same range and trigger as a version that failed. */
  async retry(id: string): Promise<RoutineSummary> {
    const failed = await this.repository.findById(this.currentUser.id, id);
    if (!failed) throw AppError.notFound('Rotina');
    if (failed.status !== 'FAILED') {
      throw new AppError(
        'ROUTINE_NOT_FAILED',
        'Só é possível tentar de novo uma geração que falhou.',
      );
    }
    return this.startJob(failed.trigger, {
      rangeStart: failed.rangeStart,
      rangeEnd: failed.rangeEnd,
    });
  }

  private async runJob(
    userId: string,
    routineId: string,
    range: PlanningRange,
    instruction?: string,
  ): Promise<void> {
    try {
      const [prefs, commitments, allTasks, previous] = await Promise.all([
        this.preferences.getFor(userId),
        this.commitments.findAll(userId),
        this.tasks.findAll(userId),
        this.repository.findActive(userId),
      ]);
      const now = this.clock.now().getTime();
      const openTasks = allTasks.filter((task) => task.status !== 'DONE');
      const estimated = openTasks.filter((task) => task.estimationStatus === 'DONE');
      const titles = new Map(allTasks.map((task) => [task.id, task.title]));
      const commitmentTitles = new Map(commitments.map((item) => [item.id, item.title]));
      const commitmentOfTask = new Map(
        allTasks.flatMap((task) => {
          const title = task.commitmentId ? commitmentTitles.get(task.commitmentId) : undefined;
          return title ? [[task.id, title] as const] : [];
        }),
      );

      const carried = selectCarriedBlocks(previous?.blocks ?? [], {
        openTaskIds: new Set(openTasks.map((task) => task.id)),
        now,
        range,
        prefs,
      });
      const fixedBlocks: EngineBlock[] = carried.map((block) => ({
        taskId: block.taskId,
        start: block.start.getTime(),
        end: block.end.getTime(),
      }));
      const context: PlanningContext = { prefs, commitments, ...range, now, fixedBlocks };
      const engineTasks = toEngineTasks(estimated, carried);

      const aiAvailable = this.proposer.isAvailable();
      // Over the daily budget the routine is still built, by the heuristic.
      const decision = aiAvailable ? await this.quota.acquire(userId) : null;
      const useAi = decision === 'ALLOWED';
      const buildInput = buildPlanningInput(context, titles, commitmentOfTask, instruction);
      const { aiTasks, overflow } = useAi
        ? this.fitToBudget(engineTasks, buildInput)
        : { aiTasks: engineTasks, overflow: [] };
      const planned = await planRoutine({
        tasks: aiTasks,
        context,
        propose: useAi
          ? buildProposeFn(this.config.AI_PLANNING_STRATEGY, this.proposer, context, buildInput)
          : undefined,
      });
      // Tasks that did not fit the AI input budget are placed by the heuristic around the AI's blocks.
      const rest =
        overflow.length > 0 ? scheduleHeuristic(overflow, context, planned.blocks) : null;
      const withRest = rest
        ? {
            ...planned,
            blocks: [...planned.blocks, ...rest.blocks].sort((a, b) => a.start - b.start),
            unscheduled: [...planned.unscheduled, ...rest.unscheduled],
            shortfalls: [...planned.shortfalls, ...rest.shortfalls],
          }
        : planned;
      const plan =
        decision && !useAi && withRest.notice
          ? { ...withRest, notice: noticeFor(decision) }
          : withRest;

      const blocks: NewBlock[] = [
        ...carried.map((block) => ({
          taskId: block.taskId,
          start: block.start,
          end: block.end,
          locked: block.locked,
          completedAt: block.completedAt,
          rationale: block.rationale,
        })),
        ...plan.blocks.map((block) => ({
          taskId: block.taskId,
          start: new Date(block.start),
          end: new Date(block.end),
          locked: false,
          completedAt: null,
          rationale: block.rationale ?? null,
        })),
      ];
      const unscheduled: UnscheduledTask[] = [
        ...plan.unscheduled.map((item) => ({ ...item, title: titles.get(item.taskId) ?? '' })),
        // Scheduled, but for less time than needed: the user is told to do it in a shorter session.
        ...plan.shortfalls.map((item) => ({
          taskId: item.taskId,
          title: titles.get(item.taskId) ?? '',
          reason: 'PARTIAL' as const,
          missingMinutes: item.missingMinutes,
          neededMinutes: item.neededMinutes,
          allocatedMinutes: item.allocatedMinutes,
        })),
        ...openTasks
          .filter((task) => task.estimationStatus !== 'DONE')
          .map((task) => ({
            taskId: task.id,
            title: task.title,
            reason: 'NOT_ESTIMATED' as const,
            missingMinutes: 0,
          })),
      ];
      const openIds = new Set(openTasks.map((task) => task.id));

      await this.repository.activate(userId, routineId, {
        source: plan.source,
        notice: plan.notice,
        unscheduled,
        blocks,
        diffSummary: diffBlocks(toDiffBlocks(previous?.blocks ?? []), toDiffBlocks(blocks)),
        scheduledTaskIds: [...new Set(blocks.map((block) => block.taskId))].filter((id) =>
          openIds.has(id),
        ),
      });
    } catch (error) {
      this.logger.error(`Routine job ${routineId} failed: ${(error as Error).stack ?? error}`);
      await this.repository
        .markFailed(routineId, 'Não foi possível gerar a rotina. Tente novamente.')
        .catch(() => undefined);
    }
  }

  /** Keeps the most urgent tasks that fit `LLM_MAX_INPUT_TOKENS`; the rest overflows to the heuristic. */
  private fitToBudget(
    tasks: readonly EngineTask[],
    buildInput: (tasks: readonly EngineTask[]) => RoutinePlanningInput,
  ): { aiTasks: EngineTask[]; overflow: EngineTask[] } {
    const sorted = [...tasks].sort(compareTasks);
    let count = sorted.length;
    while (
      count > 1 &&
      this.proposer.estimateInputTokens(buildInput(sorted.slice(0, count))) >
        this.config.LLM_MAX_INPUT_TOKENS
    ) {
      count -= 1;
    }
    if (count < sorted.length) {
      this.logger.warn(
        `AI input budget (${this.config.LLM_MAX_INPUT_TOKENS} tokens): ${sorted.length - count} task(s) left to the heuristic`,
      );
    }
    return { aiTasks: sorted.slice(0, count), overflow: sorted.slice(count) };
  }

  // ─── History ───────────────────────────────────────────────────────────────

  /**
   * Restores an old version as a new one. Completed blocks come back as they were;
   * unfinished blocks are restored only if they are still in the future and still
   * valid against today's commitments, preferences and deadlines.
   */
  async restore(id: string): Promise<Routine> {
    const userId = this.currentUser.id;
    const source = await this.repository.findById(userId, id);
    if (!source) throw AppError.notFound('Rotina');
    if (source.status !== 'READY') {
      throw new AppError('ROUTINE_NOT_READY', 'Só é possível restaurar uma rotina concluída.');
    }
    if (await this.repository.findPending(userId)) {
      throw AppError.conflict('GENERATION_IN_PROGRESS', 'Já existe uma rotina sendo gerada.');
    }
    const [prefs, commitments, previous] = await Promise.all([
      this.preferences.get(),
      this.commitments.findAll(userId),
      this.repository.findActive(userId),
    ]);
    const now = this.clock.now().getTime();

    const restored: NewBlock[] = [];
    let dropped = 0;
    for (const block of source.blocks) {
      const candidate: NewBlock = {
        taskId: block.taskId,
        start: block.start,
        end: block.end,
        locked: block.locked,
        completedAt: block.completedAt,
        rationale: block.rationale,
      };
      if (block.completedAt) {
        restored.push(candidate);
        continue;
      }
      const violations =
        block.task.status === 'DONE' || block.end.getTime() <= now
          ? ['IN_THE_PAST']
          : checkPlacement(
              { start: block.start.getTime(), end: block.end.getTime() },
              {
                prefs,
                commitments,
                otherBlocks: restored.map(toInterval),
                deadline: block.task.deadline.getTime(),
              },
            );
      if (violations.length > 0) dropped += 1;
      else restored.push(candidate);
    }

    const pending = await this.repository.createPending(userId, {
      trigger: 'RESTORE',
      rangeStart: source.rangeStart,
      rangeEnd: source.rangeEnd,
    });
    const scheduled = new Set(
      restored.filter((block) => !block.completedAt).map((block) => block.taskId),
    );
    await this.repository.activate(userId, pending.id, {
      source: source.source ?? 'HEURISTIC',
      notice:
        dropped > 0
          ? `Versão ${source.version} restaurada. ${dropped} bloco(s) não puderam ser restaurados porque já passaram ou conflitam com a agenda atual.`
          : `Versão ${source.version} restaurada.`,
      unscheduled: [],
      blocks: restored,
      diffSummary: diffBlocks(toDiffBlocks(previous?.blocks ?? []), toDiffBlocks(restored)),
      scheduledTaskIds: [...scheduled],
    });
    return this.get(pending.id);
  }

  // ─── Manual adjustments ────────────────────────────────────────────────────

  /** Moves/resizes a block. Conflicts are rejected; a moved block becomes locked. */
  async moveBlock(blockId: string, input: MoveBlockInput): Promise<RoutineBlock> {
    const block = await this.findEditableBlock(blockId);
    const [prefs, commitments, siblings] = await Promise.all([
      this.preferences.get(),
      this.commitments.findAll(this.currentUser.id),
      this.repository.findSiblingBlocks(block.routineId, block.id),
    ]);
    const violations = checkPlacement(
      { start: Date.parse(input.start), end: Date.parse(input.end) },
      {
        prefs: prefs satisfies Preferences,
        commitments,
        otherBlocks: siblings.map(toInterval),
        deadline: block.task.deadline.getTime(),
        now: this.clock.now().getTime(),
      },
    );
    if (violations.length > 0) {
      throw new AppError(
        'BLOCK_CONFLICT',
        'O bloco não pode ficar neste horário.',
        HttpStatus.CONFLICT,
        { violations },
      );
    }
    return toBlockDto(
      await this.repository.updateBlock(block.id, {
        start: new Date(input.start),
        end: new Date(input.end),
        locked: true,
      }),
    );
  }

  async setLocked(blockId: string, locked: boolean): Promise<RoutineBlock> {
    const block = await this.findEditableBlock(blockId);
    return toBlockDto(await this.repository.updateBlock(block.id, { locked }));
  }

  /** Completes (or reopens) a block; the task is DONE once all its blocks are. */
  async completeBlock(blockId: string, completed: boolean): Promise<RoutineBlock> {
    const block = await this.findActiveBlock(blockId);
    const updated = await this.repository.updateBlock(block.id, {
      completedAt: completed ? this.clock.now() : null,
    });
    const incomplete = await this.repository.countIncompleteBlocks(block.routineId, block.taskId);
    const status = incomplete === 0 ? 'DONE' : 'SCHEDULED';
    if (updated.task.status !== status) {
      await this.tasks.update(block.taskId, { status });
      updated.task.status = status;
    }
    return toBlockDto(updated);
  }

  private async findActiveBlock(blockId: string) {
    const block = await this.repository.findBlock(this.currentUser.id, blockId);
    if (!block) throw AppError.notFound('Bloco');
    // The running generation works on a snapshot: edits made now would be lost or collide.
    if (await this.repository.findPending(this.currentUser.id)) {
      throw AppError.conflict(
        'GENERATION_IN_PROGRESS',
        'A rotina está sendo gerada. Aguarde para editar os blocos.',
      );
    }
    if (!block.routine.active) {
      throw AppError.conflict(
        'ROUTINE_NOT_ACTIVE',
        'Este bloco pertence a uma versão antiga da rotina.',
      );
    }
    return block;
  }

  private async findEditableBlock(blockId: string) {
    const block = await this.findActiveBlock(blockId);
    if (block.completedAt) {
      throw AppError.conflict('BLOCK_COMPLETED', 'Blocos concluídos não podem ser alterados.');
    }
    return block;
  }

  private async openTasks() {
    const tasks = await this.tasks.findAll(this.currentUser.id);
    return tasks.filter((task) => task.status !== 'DONE');
  }
}

const toInterval = (block: { start: Date; end: Date }) => ({
  start: block.start.getTime(),
  end: block.end.getTime(),
});

const toDiffBlocks = (blocks: readonly (NewBlock | RoutineWithBlocks['blocks'][number])[]) =>
  blocks.map((block) => ({ taskId: block.taskId, ...toInterval(block) }));
