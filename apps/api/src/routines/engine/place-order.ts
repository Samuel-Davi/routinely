import {
  GRID_MINUTES,
  MINUTE_MS,
  utcToZonedParts,
  type DateString,
  type Interval,
} from '@routinely/shared';
import { computeFreeWindows } from './free-windows';
import type { EngineBlock, EngineTask, PlanningContext } from './types';

const GRID_MS = GRID_MINUTES * MINUTE_MS;

/** What the model decided for one task: how to split it, and an optional preferred day per block. */
export interface OrderedItem {
  taskId: string;
  blocks: { minutes: number; day?: DateString }[];
  rationale?: string;
}

/**
 * Turns "order + split" decisions into concrete blocks, deterministically: items are placed in
 * the model's order, each block in the earliest free window that holds it (windows of the
 * preferred day first). The model's sizes are only a suggestion: they are clamped to the focus
 * block, the sum is forced to the task's minutes, and unsplittable tasks stay in one block.
 * Whatever does not fit is simply left out; the validator and the heuristic deal with it.
 */
export function placeByOrder(
  items: readonly OrderedItem[],
  tasks: readonly EngineTask[],
  context: PlanningContext,
): EngineBlock[] {
  const { prefs } = context;
  const maxMinutes = prefs.maxFocusBlockMinutes;
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const placed: EngineBlock[] = [];
  const done = new Set<string>();

  for (const item of items) {
    const task = taskById.get(item.taskId);
    if (!task || done.has(task.id)) continue;
    done.add(task.id);

    const deadline = Math.floor(task.deadline / GRID_MS) * GRID_MS;
    const chunks = normalizeChunks(item, task, maxMinutes);
    for (const chunk of chunks) {
      const size = chunk.minutes * MINUTE_MS;
      const windows = computeFreeWindows(context, placed).filter(
        (window) => Math.min(window.end, deadline) - window.start >= size,
      );
      const preferred = chunk.day
        ? windows.filter((window) => dayOf(window, prefs.timezone) === chunk.day)
        : [];
      const window = preferred[0] ?? windows[0];
      if (!window) continue;
      placed.push({
        taskId: task.id,
        start: window.start,
        end: window.start + size,
        rationale: item.rationale ?? null,
      });
    }
  }
  return placed.sort((a, b) => a.start - b.start);
}

const dayOf = (window: Interval, timeZone: string): DateString =>
  utcToZonedParts(window.start, timeZone).date;

/** Sizes on the grid and within the focus block, summing exactly to `task.minutes`. */
function normalizeChunks(
  item: OrderedItem,
  task: EngineTask,
  maxMinutes: number,
): { minutes: number; day?: DateString }[] {
  if (!task.splittable) {
    return [{ minutes: task.minutes, day: item.blocks[0]?.day }];
  }
  const chunks: { minutes: number; day?: DateString }[] = [];
  let remaining = task.minutes;
  for (const block of item.blocks) {
    if (remaining <= 0) break;
    const snapped = Math.max(GRID_MINUTES, Math.round(block.minutes / GRID_MINUTES) * GRID_MINUTES);
    const minutes = Math.min(snapped, maxMinutes, remaining);
    chunks.push({ minutes, day: block.day });
    remaining -= minutes;
  }
  // The model's split fell short: cover the rest with full-size blocks.
  while (remaining > 0) {
    const minutes = Math.min(maxMinutes, remaining);
    chunks.push({ minutes });
    remaining -= minutes;
  }
  return chunks;
}
