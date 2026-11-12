import {
  GRID_MINUTES,
  MINUTE_MS,
  PRIORITY_WEIGHT,
  dayWindow,
  type Interval,
} from '@routinely/shared';
import { computeFreeWindows } from './free-windows';
import type {
  EngineBlock,
  EngineShortfall,
  EngineTask,
  EngineUnscheduled,
  PlanningContext,
} from './types';

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
  /** Nothing could be scheduled for these. */
  unscheduled: EngineUnscheduled[];
  /** Scheduled in part only: everything that fits before the deadline was used. */
  shortfalls: EngineShortfall[];
}

/** Pieces of a split task are at least this long, unless nothing else makes it fit. */
export const PREFERRED_MIN_CHUNK_MINUTES = 30;
const PREFERRED_MIN_CHUNK_MS = PREFERRED_MIN_CHUNK_MINUTES * MINUTE_MS;

interface Placement {
  blocks: EngineBlock[];
  missingMinutes: number;
}

/**
 * Places one task first-fit; returns its blocks and how many minutes did not fit.
 * A piece is never smaller than `minChunkMs` (except when the whole task is), and a
 * block is shortened rather than leaving a tail below that minimum.
 */
function placeTask(
  task: EngineTask,
  windows: readonly Interval[],
  maxBlockMs: number,
  breakMs: number,
  minChunkMs: number = GRID_MS,
): Placement {
  const blocks: EngineBlock[] = [];
  let remaining = task.minutes * MINUTE_MS;
  // The break between two blocks of the same task also holds across windows (e.g. two windows
  // separated by a short commitment): remember where the last block ended.
  let lastEnd = Number.NEGATIVE_INFINITY;

  for (const window of windows) {
    const end = Math.min(window.end, Math.floor(task.deadline / GRID_MS) * GRID_MS);
    let cursor = Math.max(window.start, lastEnd + breakMs);
    while (remaining > 0 && end - cursor >= GRID_MS) {
      let size = Math.min(remaining, maxBlockMs, end - cursor);
      // An unsplittable task needs one window that takes it whole.
      if (!task.splittable && size < remaining) break;
      if (size < Math.min(minChunkMs, remaining)) break;
      // 90 + 15 becomes 75 + 30: never leave a crumb as the last piece.
      const tail = remaining - size;
      if (tail > 0 && tail < minChunkMs && size - (minChunkMs - tail) >= minChunkMs) {
        size -= minChunkMs - tail;
      }
      blocks.push({
        taskId: task.id,
        start: cursor,
        end: cursor + size,
        rationale: HEURISTIC_RATIONALE,
      });
      remaining -= size;
      lastEnd = cursor + size;
      cursor += size + breakMs;
    }
    if (remaining === 0) break;
  }
  return { blocks, missingMinutes: remaining / MINUTE_MS };
}

/**
 * Absorbs missing minutes by stretching blocks already placed into the free time
 * right after them, up to the max focus block. Returns the minutes still missing.
 * (Blocks always start at the beginning of their free window, so there is never
 * room before them.)
 */
function growBlocks(
  blocks: EngineBlock[],
  missingMinutes: number,
  task: EngineTask,
  context: PlanningContext,
  placed: readonly EngineBlock[],
  maxBlockMs: number,
): number {
  let deficit = missingMinutes * MINUTE_MS;
  const deadline = Math.floor(task.deadline / GRID_MS) * GRID_MS;
  for (const block of blocks) {
    const others = [...placed, ...blocks.filter((other) => other !== block)];
    // The window that holds this block once its own footprint is removed.
    const room = computeFreeWindows(context, others).find(
      (window) => window.start <= block.start && window.end >= block.end,
    ) as Interval;
    const forward = Math.min(
      deficit,
      maxBlockMs - (block.end - block.start),
      Math.min(room.end, deadline) - block.end,
    );
    block.end += forward;
    deficit -= forward;
  }
  return deficit / MINUTE_MS;
}

/**
 * Splits a task avoiding crumbs: pieces of 30+ minutes first, then stretching
 * those pieces, and 15 minute pieces only for whatever still does not fit.
 */
function placeSplittable(
  task: EngineTask,
  context: PlanningContext,
  placed: readonly EngineBlock[],
  maxBlockMs: number,
  breakMs: number,
): Placement {
  const windows = computeFreeWindows(context, placed);
  // A task that fits in one focus block is kept whole when some window allows it.
  if (task.minutes * MINUTE_MS <= maxBlockMs) {
    const whole = placeTask({ ...task, splittable: false }, windows, maxBlockMs, breakMs);
    if (whole.missingMinutes === 0) return whole;
  }
  const preferred = placeTask(task, windows, maxBlockMs, breakMs, PREFERRED_MIN_CHUNK_MS);
  if (preferred.missingMinutes === 0) return preferred;

  const blocks = preferred.blocks;
  const missing = growBlocks(blocks, preferred.missingMinutes, task, context, placed, maxBlockMs);
  // Only a shaved block can grow, and by less than what is missing, so there is
  // always a remainder here: it goes to 15 minute pieces.
  const crumbs = placeTask(
    { ...task, minutes: missing },
    computeFreeWindows(context, [...placed, ...blocks]),
    maxBlockMs,
    breakMs,
  );
  if (crumbs.missingMinutes === 0) {
    return { blocks: [...blocks, ...crumbs.blocks], missingMinutes: 0 };
  }
  // Last resort: plain first-fit, which also yields the honest "missing" figure.
  return placeTask(task, windows, maxBlockMs, breakMs);
}

/**
 * Best effort when a task does not fit whole before its deadline: schedule as many minutes as
 * there is room for, so the user can still start it (and is told it is a shorter session).
 *  - splittable: first-fit over every free window; the pass with the fewest missing minutes wins
 *    (pieces of 30+ minutes first, then 15 minute pieces to squeeze in whatever is left);
 *  - not splittable: one block, as long as the longest usable window allows (never past the
 *    focus block), in the earliest window that gives that length.
 */
function placePartial(
  task: EngineTask,
  windows: readonly Interval[],
  maxBlockMs: number,
  breakMs: number,
): Placement {
  if (task.splittable) {
    const preferred = placeTask(task, windows, maxBlockMs, breakMs, PREFERRED_MIN_CHUNK_MS);
    const squeezed = placeTask(task, windows, maxBlockMs, breakMs);
    return squeezed.missingMinutes < preferred.missingMinutes ? squeezed : preferred;
  }
  const deadline = Math.floor(task.deadline / GRID_MS) * GRID_MS;
  const wanted = Math.min(task.minutes * MINUTE_MS, maxBlockMs);
  const usable = windows.map((window) => ({
    start: window.start,
    length: Math.min(Math.min(window.end, deadline) - window.start, wanted),
  }));
  const best = Math.max(0, ...usable.map((window) => window.length));
  const chosen = usable.find((window) => window.length === best);
  if (!chosen || best < GRID_MS) return { blocks: [], missingMinutes: task.minutes };
  return {
    blocks: [
      {
        taskId: task.id,
        start: chosen.start,
        end: chosen.start + best,
        rationale: HEURISTIC_RATIONALE,
      },
    ],
    missingMinutes: task.minutes - best / MINUTE_MS,
  };
}

/** Joins touching blocks of the same task when the result still fits one focus block. */
export function mergeTouchingBlocks(
  blocks: readonly EngineBlock[],
  maxFocusBlockMinutes: number,
): EngineBlock[] {
  const merged: EngineBlock[] = [];
  for (const block of [...blocks].sort((a, b) => a.start - b.start)) {
    const previous = merged.find(
      (candidate) =>
        candidate.taskId === block.taskId &&
        candidate.end === block.start &&
        (block.end - candidate.start) / MINUTE_MS <= maxFocusBlockMinutes,
    );
    if (previous) previous.end = block.end;
    else merged.push({ ...block });
  }
  return merged;
}

/**
 * Deterministic fallback planner: order by deadline/priority/complexity and place
 * each task first-fit in the free windows. Never late and never dropped when there is
 * room: a task that does not fit whole before its deadline gets everything that does fit
 * (reported as a shortfall, so the UI can say "only 6h of 8h"); only a task with no usable
 * time at all before its deadline is reported as unscheduled.
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
  const shortfalls: EngineShortfall[] = [];

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
    // An unsplittable task longer than a focus block can never fit whole: go straight to partial.
    const tooLongForBlock = !task.splittable && task.minutes > prefs.maxFocusBlockMinutes;
    const full = tooLongForBlock
      ? { blocks: [], missingMinutes: task.minutes }
      : task.splittable
        ? placeSplittable(task, context, placed, maxBlockMs, breakMs)
        : placeTask(task, computeFreeWindows(context, placed), maxBlockMs, breakMs);
    const attempt =
      full.missingMinutes > 0
        ? placePartial(task, computeFreeWindows(context, placed), maxBlockMs, breakMs)
        : full;
    if (attempt.blocks.length === 0) {
      unscheduled.push({
        taskId: task.id,
        // The deadline is beyond the planned range: the range is simply full.
        reason: task.deadline > rangeEnd ? 'NO_FREE_TIME' : 'DEADLINE_IMPOSSIBLE',
        missingMinutes: task.minutes,
      });
      continue;
    }
    const taskBlocks = mergeTouchingBlocks(attempt.blocks, prefs.maxFocusBlockMinutes);
    placed.push(...taskBlocks);
    blocks.push(...taskBlocks);
    if (attempt.missingMinutes > 0) {
      shortfalls.push({
        taskId: task.id,
        neededMinutes: task.minutes,
        allocatedMinutes: task.minutes - attempt.missingMinutes,
        missingMinutes: attempt.missingMinutes,
      });
    }
  }

  return { blocks: blocks.sort((a, b) => a.start - b.start), unscheduled, shortfalls };
}
