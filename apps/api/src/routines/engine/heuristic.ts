import {
  GRID_MINUTES,
  MINUTE_MS,
  PRIORITY_WEIGHT,
  dayWindow,
  type Interval,
} from '@routinely/shared';
import { computeFreeWindows } from './free-windows';
import type { EngineBlock, EngineTask, EngineUnscheduled, PlanningContext } from './types';

const GRID_MS = GRID_MINUTES * MINUTE_MS;

export const HEURISTIC_RATIONALE =
  'Alocado automaticamente no primeiro horário livre antes do prazo.';

/** Earliest deadline, then highest priority, then highest complexity (id breaks ties). */
export function compareTasks(a: EngineTask, b: EngineTask): number {
  return (
    a.deadline - b.deadline ||
    PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
    b.complexity - a.complexity ||
    a.id.localeCompare(b.id)
  );
}

export interface HeuristicResult {
  blocks: EngineBlock[];
  unscheduled: EngineUnscheduled[];
}

/** Splitting first tries pieces of at least this size, to avoid 15 minute crumbs. */
const PREFERRED_MIN_CHUNK_MS = 30 * MINUTE_MS;

/**
 * Tries to place one task first-fit; returns its blocks or how many minutes did not
 * fit. A piece is never smaller than `minChunkMs`, except the last one of a task.
 */
function placeTask(
  task: EngineTask,
  windows: readonly Interval[],
  maxBlockMs: number,
  breakMs: number,
  minChunkMs: number = GRID_MS,
): { blocks: EngineBlock[]; missingMinutes: number } {
  const blocks: EngineBlock[] = [];
  let remaining = task.minutes * MINUTE_MS;

  for (const window of windows) {
    const end = Math.min(window.end, Math.floor(task.deadline / GRID_MS) * GRID_MS);
    let cursor = window.start;
    while (remaining > 0 && end - cursor >= GRID_MS) {
      const size = Math.min(remaining, maxBlockMs, end - cursor);
      // An unsplittable task needs one window that takes it whole.
      if (!task.splittable && size < remaining) break;
      if (size < Math.min(minChunkMs, remaining)) break;
      blocks.push({
        taskId: task.id,
        start: cursor,
        end: cursor + size,
        rationale: HEURISTIC_RATIONALE,
      });
      remaining -= size;
      cursor += size + breakMs;
    }
    if (remaining === 0) break;
  }
  return { blocks, missingMinutes: remaining / MINUTE_MS };
}

/**
 * Deterministic fallback planner: order by deadline/priority/complexity and place
 * each task first-fit in the free windows. All or nothing per task — a task that
 * cannot be fully placed before its deadline is reported, never scheduled late.
 */
export function scheduleHeuristic(
  tasks: readonly EngineTask[],
  context: PlanningContext,
  occupied: readonly EngineBlock[] = [],
): HeuristicResult {
  const { prefs } = context;
  const maxBlockMs = prefs.maxFocusBlockMinutes * MINUTE_MS;
  const breakMs = prefs.minBreakMinutes * MINUTE_MS;
  const earliest = Math.ceil(context.now / GRID_MS) * GRID_MS;
  const rangeEnd = dayWindow(context.rangeEnd, prefs).end;

  const placed: EngineBlock[] = [...occupied];
  const blocks: EngineBlock[] = [];
  const unscheduled: EngineUnscheduled[] = [];

  for (const task of [...tasks].sort(compareTasks)) {
    if (task.minutes <= 0) continue;
    if (task.deadline <= earliest) {
      unscheduled.push({
        taskId: task.id,
        reason: 'DEADLINE_PASSED',
        missingMinutes: task.minutes,
      });
      continue;
    }
    if (!task.splittable && task.minutes > prefs.maxFocusBlockMinutes) {
      unscheduled.push({
        taskId: task.id,
        reason: 'TOO_LONG_FOR_BLOCK',
        missingMinutes: task.minutes,
      });
      continue;
    }
    const windows = computeFreeWindows(context, placed);
    // A task that fits in one focus block is kept whole when some window allows it.
    const whole =
      task.splittable && task.minutes <= prefs.maxFocusBlockMinutes
        ? placeTask({ ...task, splittable: false }, windows, maxBlockMs, breakMs)
        : null;
    const comfortable =
      whole?.missingMinutes === 0
        ? whole
        : placeTask(task, windows, maxBlockMs, breakMs, PREFERRED_MIN_CHUNK_MS);
    // Only fall back to 15 minute pieces when that is what makes the task fit.
    const attempt =
      comfortable.missingMinutes === 0
        ? comfortable
        : placeTask(task, windows, maxBlockMs, breakMs);
    if (attempt.missingMinutes > 0) {
      unscheduled.push({
        taskId: task.id,
        // The deadline is beyond the planned range: the range is simply full.
        reason: task.deadline > rangeEnd ? 'NO_FREE_TIME' : 'DEADLINE_IMPOSSIBLE',
        missingMinutes: attempt.missingMinutes,
      });
      continue;
    }
    placed.push(...attempt.blocks);
    blocks.push(...attempt.blocks);
  }

  return { blocks: blocks.sort((a, b) => a.start - b.start), unscheduled };
}
