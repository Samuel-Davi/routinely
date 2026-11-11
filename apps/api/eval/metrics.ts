import { MINUTE_MS } from '@routinely/shared';
import {
  compareTasks,
  type EngineBlock,
  type EngineTask,
  type PlanResult,
} from '../src/routines/engine';

export interface RunMetrics {
  source: PlanResult['source'];
  /** The first proposal passed the validator with no issue at all. `null` when there was no AI. */
  validFirstTry: boolean | null;
  /** The heuristic had to place something (source is not a pure AI plan). */
  neededFallback: boolean;
  /** Blocks under 30 minutes that belong to tasks of 30+ minutes. */
  shortBlocks: number;
  unscheduled: number;
  /** Share of task pairs (urgent before less urgent) whose first blocks follow that order. */
  adherence: number | null;
  aiCalls: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  errors: string[];
  /** Every attempt of a call hit the rate limit: the run says nothing about the model. */
  quotaLimited?: boolean;
}

export function shortBlocks(blocks: readonly EngineBlock[], tasks: readonly EngineTask[]): number {
  const long = new Set(tasks.filter((task) => task.minutes >= 30).map((task) => task.id));
  return blocks.filter(
    (block) => long.has(block.taskId) && (block.end - block.start) / MINUTE_MS < 30,
  ).length;
}

/**
 * Priority/deadline adherence: among scheduled tasks, for each pair where one is more urgent by
 * the canonical order (deadline, then priority, then complexity), does it start first?
 */
export function adherence(
  blocks: readonly EngineBlock[],
  tasks: readonly EngineTask[],
): number | null {
  const firstStart = new Map<string, number>();
  for (const block of blocks) {
    const current = firstStart.get(block.taskId);
    if (current === undefined || block.start < current) firstStart.set(block.taskId, block.start);
  }
  const scheduled = tasks.filter((task) => firstStart.has(task.id)).sort(compareTasks);
  let pairs = 0;
  let ordered = 0;
  for (let i = 0; i < scheduled.length; i += 1) {
    for (let j = i + 1; j < scheduled.length; j += 1) {
      pairs += 1;
      if (
        (firstStart.get(scheduled[i]!.id) as number) <= (firstStart.get(scheduled[j]!.id) as number)
      ) {
        ordered += 1;
      }
    }
  }
  return pairs === 0 ? null : ordered / pairs;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const pct = (values: readonly boolean[]): number => mean(values.map(Number)) * 100;

export interface Aggregate {
  model: string;
  strategy: string;
  runs: number;
  validFirstTryPct: number | null;
  fallbackPct: number;
  shortBlocks: number;
  unscheduled: number;
  adherencePct: number | null;
  inputTokens: number;
  outputTokens: number;
  latencyS: number;
  errorRuns: number;
  /** Runs dropped from the averages because the API quota was exhausted. */
  discarded: number;
}

export function aggregate(
  model: string,
  strategy: string,
  allRuns: readonly RunMetrics[],
): Aggregate {
  const runs = allRuns.filter((run) => !run.quotaLimited);
  const firsts = runs.flatMap((run) => (run.validFirstTry === null ? [] : [run.validFirstTry]));
  const adherences = runs.flatMap((run) => (run.adherence === null ? [] : [run.adherence]));
  return {
    model,
    strategy,
    runs: runs.length,
    validFirstTryPct: firsts.length === 0 ? null : pct(firsts),
    fallbackPct: pct(runs.map((run) => run.neededFallback)),
    shortBlocks: mean(runs.map((run) => run.shortBlocks)),
    unscheduled: mean(runs.map((run) => run.unscheduled)),
    adherencePct: adherences.length === 0 ? null : mean(adherences) * 100,
    inputTokens: mean(runs.map((run) => run.inputTokens)),
    outputTokens: mean(runs.map((run) => run.outputTokens)),
    latencyS: mean(runs.map((run) => run.latencyMs)) / 1000,
    errorRuns: runs.filter((run) => run.errors.length > 0).length,
    discarded: allRuns.length - runs.length,
  };
}

const f = (value: number | null, digits = 0, suffix = ''): string =>
  value === null ? '–' : `${value.toFixed(digits)}${suffix}`;

export function toMarkdown(rows: readonly Aggregate[]): string {
  const header =
    '| Modelo | Estratégia | Execuções | Válido na 1ª | Precisou de fallback | Blocos < 30 min | Não encaixadas | Aderência | Tokens in/out | Latência | Execuções com erro | Descartadas (cota) |';
  const sep = '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';
  const lines = rows.map(
    (row) =>
      `| ${row.model} | ${row.strategy} | ${row.runs} | ${f(row.validFirstTryPct, 0, '%')} | ${f(row.fallbackPct, 0, '%')} | ${f(row.shortBlocks, 1)} | ${f(row.unscheduled, 1)} | ${f(row.adherencePct, 0, '%')} | ${f(row.inputTokens)} / ${f(row.outputTokens)} | ${f(row.latencyS, 1, ' s')} | ${row.errorRuns} | ${row.discarded} |`,
  );
  return [header, sep, ...lines].join('\n');
}
