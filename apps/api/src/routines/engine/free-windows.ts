import {
  GRID_MINUTES,
  MINUTE_MS,
  ceilToGrid,
  dateRange,
  dayWindow,
  diffInDays,
  expandCommitments,
  lunchInterval,
  subtractIntervals,
  type Interval,
} from '@routinely/shared';
import type { PlanningContext } from './types';

const GRID_MS = GRID_MINUTES * MINUTE_MS;

/** Task blocks need `minBreakMinutes` of air on both sides. */
export function padBlocks(blocks: readonly Interval[], minBreakMinutes: number): Interval[] {
  const padding = minBreakMinutes * MINUTE_MS;
  return blocks.map((block) => ({ start: block.start - padding, end: block.end + padding }));
}

/**
 * Deterministic free time: for every day in the range, the daily window minus the
 * protected lunch, fixed commitments and existing task blocks (plus their break),
 * never before `now`, snapped inward to the 15 minute grid.
 */
export function computeFreeWindows(
  context: PlanningContext,
  occupied: readonly Interval[] = [],
): Interval[] {
  const { prefs } = context;
  const days = diffInDays(context.rangeStart, context.rangeEnd) + 1;
  const commitments = expandCommitments(
    context.commitments,
    context.rangeStart,
    days,
    prefs.timezone,
  );
  const taskBlocks = padBlocks([...context.fixedBlocks, ...occupied], prefs.minBreakMinutes);
  const earliest = ceilToGrid(context.now);

  const windows: Interval[] = [];
  for (const date of dateRange(context.rangeStart, days)) {
    const day = dayWindow(date, prefs);
    const busy = [lunchInterval(date, prefs), ...commitments, ...taskBlocks];
    for (const free of subtractIntervals(day, busy)) {
      const start = Math.max(ceilToGrid(free.start), earliest);
      const end = Math.floor(free.end / GRID_MS) * GRID_MS;
      if (end - start >= GRID_MS) windows.push({ start, end });
    }
  }
  return windows;
}

/** Total free minutes of a list of windows. */
export function totalMinutes(windows: readonly Interval[]): number {
  return windows.reduce((sum, window) => sum + (window.end - window.start) / MINUTE_MS, 0);
}
