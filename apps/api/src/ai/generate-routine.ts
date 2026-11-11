import { Injectable } from '@nestjs/common';
import {
  generateRoutineOutputSchema,
  type Priority,
  type RoutineAllocation,
} from '@routinely/shared';
import { LlmClient } from './llm-client';
import { LlmError, type ModelTier } from './llm-provider';
import { loadPrompt, renderPrompt, sanitizeForPrompt } from './prompt-loader';

/** Everything is expressed in the user's local time (`YYYY-MM-DDTHH:mm`). */
export interface RoutinePlanningInput {
  timezone: string;
  now: string;
  maxFocusBlockMinutes: number;
  minBreakMinutes: number;
  /** Free windows computed deterministically by the backend. */
  freeWindows: { start: string; end: string }[];
  tasks: {
    id: string;
    title: string;
    priority: Priority;
    deadline: string;
    complexity: number;
    /** Minutes still to be allocated. */
    minutes: number;
    splittable: boolean;
    /** Title of the fixed commitment the task relates to, when linked. */
    commitment?: string;
  }[];
  lockedBlocks: { title: string; start: string; end: string }[];
  /** Domain validation errors of a previous proposal, fed back to the model. */
  feedback?: string[];
  tier?: ModelTier;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function weekdayOf(date: string): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] as string;
}

/** Groups windows by day: `2026-11-10 (terça): 07:00–08:00, 10:00–12:00`. */
export function formatFreeWindows(windows: RoutinePlanningInput['freeWindows']): string {
  const byDay = new Map<string, string[]>();
  for (const window of windows) {
    const [date, start] = window.start.split('T') as [string, string];
    const end = window.end.split('T')[1] as string;
    byDay.set(date, [...(byDay.get(date) ?? []), `${start}–${end}`]);
  }
  if (byDay.size === 0) return '(nenhuma janela livre)';
  return [...byDay.entries()]
    .map(([date, ranges]) => `${date} (${weekdayOf(date)}): ${ranges.join(', ')}`)
    .join('\n');
}

/**
 * Use case 2: free windows + open tasks + preferences + locked blocks → proposed
 * allocations. This only *proposes*: the routines module validates every block.
 */
@Injectable()
export class RoutineProposer {
  constructor(private readonly llm: LlmClient) {}

  isAvailable(): boolean {
    return this.llm.isConfigured();
  }

  buildPrompt(input: RoutinePlanningInput): { prompt: string; aliases: Map<string, string> } {
    // Short aliases (T1, T2…) are cheaper and less error-prone than UUIDs.
    const aliases = new Map<string, string>();
    const tasks = input.tasks.map((task, index) => {
      const alias = `T${index + 1}`;
      aliases.set(alias, task.id);
      return [
        alias,
        `"${sanitizeForPrompt(task.title, 120)}"`,
        `prioridade ${task.priority}`,
        `prazo ${task.deadline}`,
        `complexidade ${task.complexity}`,
        `${task.minutes} min`,
        `divisível: ${task.splittable ? 'sim' : 'não'}`,
        ...(task.commitment ? [`relacionada a "${sanitizeForPrompt(task.commitment, 80)}"`] : []),
      ].join(' | ');
    });
    const lockedBlocks = input.lockedBlocks.map(
      (block) => `"${sanitizeForPrompt(block.title, 120)}": ${block.start} → ${block.end}`,
    );
    let prompt = renderPrompt(loadPrompt('generate-routine.user'), {
      timezone: input.timezone,
      now: input.now,
      maxFocusBlockMinutes: input.maxFocusBlockMinutes,
      minBreakMinutes: input.minBreakMinutes,
      freeWindows: formatFreeWindows(input.freeWindows),
      lockedBlocks: lockedBlocks.length > 0 ? lockedBlocks.join('\n') : '(nenhum)',
      tasks: tasks.join('\n'),
    });
    if (input.feedback && input.feedback.length > 0) {
      prompt += [
        '\n\nATENÇÃO: sua proposta anterior foi rejeitada pelo validador. Corrija estes problemas:',
        ...input.feedback.slice(0, 20).map((issue) => `- ${issue}`),
      ].join('\n');
    }
    return { prompt, aliases };
  }

  async propose(input: RoutinePlanningInput): Promise<RoutineAllocation[]> {
    if (input.tasks.length === 0) return [];
    const { prompt, aliases } = this.buildPrompt(input);
    const output = await this.llm.generateStructured({
      name: 'generateRoutine',
      system: loadPrompt('generate-routine.system'),
      prompt,
      schema: generateRoutineOutputSchema,
      tier: input.tier,
    });
    const unknown = output.allocations.filter((allocation) => !aliases.has(allocation.taskId));
    if (unknown.length > 0) {
      throw new LlmError(
        'VALIDATION',
        'The model referenced unknown tasks',
        unknown.map((allocation) => `taskId desconhecido: ${allocation.taskId}`),
      );
    }
    return output.allocations.map((allocation) => ({
      ...allocation,
      taskId: aliases.get(allocation.taskId) as string,
    }));
  }
}
