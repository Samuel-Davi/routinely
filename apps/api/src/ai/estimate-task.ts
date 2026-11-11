import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  GRID_MINUTES,
  MAX_ESTIMATED_MINUTES,
  ceilMinutesToGrid,
  estimateTaskOutputSchema,
  toLocalDateTime,
  type EstimateTaskOutput,
  type EstimationSource,
  type Priority,
} from '@routinely/shared';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';
import { AiQuotaService } from './ai-quota.service';
import { LlmClient } from './llm-client';
import { isLlmError } from './llm-provider';
import { loadPrompt, renderPrompt, sanitizeForPrompt } from './prompt-loader';

export interface EstimateTaskInput {
  userId: string;
  title: string;
  description: string;
  priority: Priority;
  deadline: Date;
  timezone: string;
}

export interface TaskEstimate extends EstimateTaskOutput {
  source: Extract<EstimationSource, 'AI' | 'HEURISTIC'>;
  cached: boolean;
}

/** Cache key: sha256(title + description + priority), case/whitespace-insensitive. */
export function estimateHash(
  input: Pick<EstimateTaskInput, 'title' | 'description' | 'priority'>,
): string {
  const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update([normalize(input.title), normalize(input.description), input.priority].join('\u0000'))
    .digest('hex');
}

/** Clamps the model answer to the rules the scheduler relies on. */
export function normalizeEstimate(output: EstimateTaskOutput): EstimateTaskOutput {
  const estimatedMinutes = Math.min(
    MAX_ESTIMATED_MINUTES,
    Math.max(GRID_MINUTES, ceilMinutesToGrid(output.estimatedMinutes)),
  );
  return {
    complexity: output.complexity,
    estimatedMinutes,
    // A single 15 minute slot cannot be split.
    splittable: estimatedMinutes > GRID_MINUTES ? output.splittable : false,
    rationale: output.rationale.trim(),
  };
}

/** Deterministic estimate used when the AI is unavailable, so the task stays plannable. */
export function heuristicEstimate(
  input: Pick<EstimateTaskInput, 'title' | 'description'>,
): EstimateTaskOutput {
  const words = `${input.title} ${input.description}`.trim().split(/\s+/).filter(Boolean).length;
  const [complexity, estimatedMinutes] =
    words <= 4 ? [2, 30] : words <= 15 ? [3, 60] : words <= 40 ? [3, 90] : [4, 120];
  return {
    complexity,
    estimatedMinutes,
    splittable: estimatedMinutes > 60,
    rationale:
      'Estimativa automática sem IA, baseada no tamanho da descrição. Ajuste se necessário.',
  };
}

/** Use case 1: title/description/priority/deadline → complexity, minutes, splittable, rationale. */
@Injectable()
export class TaskEstimator {
  private readonly logger = new Logger(TaskEstimator.name);

  constructor(
    private readonly llm: LlmClient,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly quota: AiQuotaService,
  ) {}

  async estimate(input: EstimateTaskInput): Promise<TaskEstimate> {
    const hash = estimateHash(input);
    const cached = await this.prisma.estimateCache.findUnique({
      where: { userId_hash: { userId: input.userId, hash } },
    });
    if (cached) {
      return {
        complexity: cached.complexity,
        estimatedMinutes: cached.estimatedMinutes,
        splittable: cached.splittable,
        rationale: cached.rationale,
        source: 'AI',
        cached: true,
      };
    }

    // Demo account or out of daily AI uses: keep the task plannable with the deterministic estimate.
    const decision = await this.quota.acquire(input.userId);
    if (decision !== 'ALLOWED') {
      if (decision !== 'DEMO') this.logger.warn(`estimateTask: ${decision}, using the heuristic`);
      return { ...heuristicEstimate(input), source: 'HEURISTIC', cached: false };
    }

    try {
      const output = normalizeEstimate(
        await this.llm.generateStructured({
          name: 'estimateTask',
          system: loadPrompt('estimate-task.system'),
          prompt: renderPrompt(loadPrompt('estimate-task.user'), {
            title: sanitizeForPrompt(input.title, 120),
            description: sanitizeForPrompt(input.description, 2000),
            priority: input.priority,
            deadline: toLocalDateTime(input.deadline, input.timezone),
            now: toLocalDateTime(this.clock.now(), input.timezone),
          }),
          schema: estimateTaskOutputSchema,
        }),
      );
      await this.prisma.estimateCache.upsert({
        where: { userId_hash: { userId: input.userId, hash } },
        update: {},
        create: { userId: input.userId, hash, ...output },
      });
      return { ...output, source: 'AI', cached: false };
    } catch (error) {
      if (!isLlmError(error)) throw error;
      this.logger.warn(`estimateTask fell back to the heuristic (${error.kind})`);
      return { ...heuristicEstimate(input), source: 'HEURISTIC', cached: false };
    }
  }
}
