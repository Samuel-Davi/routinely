import {
  MAX_PLANNING_WEEKS,
  MINUTE_MS,
  addDays,
  dayWindow,
  startOfWeek,
  utcToZonedParts,
  type DateString,
  type Priority,
  type SchedulingPreferences,
} from '@routinely/shared';
import type { EngineTask } from './engine';

export interface ExistingBlock {
  taskId: string;
  start: Date;
  end: Date;
  locked: boolean;
  completedAt: Date | null;
  rationale: string | null;
}

export interface PlannableTask {
  id: string;
  title: string;
  priority: Priority;
  deadline: Date;
  complexity: number | null;
  estimatedMinutes: number | null;
  splittable: boolean | null;
}

export interface PlanningRange {
  rangeStart: DateString;
  rangeEnd: DateString;
}

/**
 * Week (Monday → Sunday) containing `anchor`, optionally extended to the week of
 * the latest open deadline, never more than `MAX_PLANNING_WEEKS` weeks.
 */
export function resolveRange(
  anchor: DateString,
  options: { untilLastDeadline: boolean; deadlines: readonly Date[]; timezone: string },
): PlanningRange {
  const rangeStart = startOfWeek(anchor);
  let rangeEnd = addDays(rangeStart, 6);
  if (options.untilLastDeadline && options.deadlines.length > 0) {
    const latest = Math.max(...options.deadlines.map((deadline) => deadline.getTime()));
    const lastWeekEnd = addDays(startOfWeek(utcToZonedParts(latest, options.timezone).date), 6);
    const cap = addDays(rangeStart, MAX_PLANNING_WEEKS * 7 - 1);
    if (lastWeekEnd > rangeEnd) rangeEnd = lastWeekEnd < cap ? lastWeekEnd : cap;
  }
  return { rangeStart, rangeEnd };
}

/**
 * Decides which blocks of the current routine survive a (re)plan:
 *  - completed blocks are history and always stay;
 *  - a block happening right now stays (the user is probably working on it);
 *  - unfinished blocks in the past are dropped, so their time is planned again;
 *  - future blocks stay when locked by the user or outside the range being planned;
 *  - anything else in the range is regenerated.
 */
export function selectCarriedBlocks<T extends ExistingBlock>(
  blocks: readonly T[],
  options: {
    openTaskIds: ReadonlySet<string>;
    now: number;
    range: PlanningRange;
    prefs: SchedulingPreferences;
  },
): T[] {
  const rangeStart = dayWindow(options.range.rangeStart, options.prefs).start;
  const rangeEnd = dayWindow(options.range.rangeEnd, options.prefs).end;
  return blocks.filter((block) => {
    if (block.completedAt) return true;
    if (!options.openTaskIds.has(block.taskId)) return false;
    const start = block.start.getTime();
    const end = block.end.getTime();
    if (end <= options.now) return false;
    if (start < options.now) return true;
    if (block.locked) return true;
    return end <= rangeStart || start >= rangeEnd;
  });
}

/** Tasks ready for planning, with the minutes not already covered by carried blocks. */
export function toEngineTasks(
  tasks: readonly PlannableTask[],
  carried: readonly ExistingBlock[],
): EngineTask[] {
  const covered = new Map<string, number>();
  for (const block of carried) {
    const minutes = (block.end.getTime() - block.start.getTime()) / MINUTE_MS;
    covered.set(block.taskId, (covered.get(block.taskId) ?? 0) + minutes);
  }
  return tasks
    .filter((task) => task.estimatedMinutes != null)
    .map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      deadline: task.deadline.getTime(),
      complexity: task.complexity ?? 3,
      minutes: Math.max(0, (task.estimatedMinutes as number) - (covered.get(task.id) ?? 0)),
      splittable: task.splittable ?? true,
    }));
}
