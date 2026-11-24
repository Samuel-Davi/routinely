import { utcToZonedParts, type DateString, type Routine, type Task } from '@routinely/shared';

/** Why a task is missing time in the active routine, if it is. */
export type StationFlag = 'PARTIAL' | 'LEFT_OUT' | null;

export interface Station {
  task: Task;
  /** Minutes of this task's blocks that fall on the visible week. */
  weekMinutes: number;
  flag: StationFlag;
}

export interface StationGroup {
  /** The commitment the tasks are linked to; null for the free line. */
  commitmentId: string | null;
  stations: Station[];
}

/**
 * Open tasks grouped by the line they ride (their commitment), for the week's side panel.
 * Groups follow `lineOrder` (commitment ids by line number) with the free line last; inside a
 * group, the nearest deadline comes first.
 */
export function buildStations(
  tasks: readonly Task[],
  routine: Routine | null,
  weekDates: readonly DateString[],
  timezone: string,
  lineOrder: readonly string[],
): StationGroup[] {
  const week = new Set(weekDates);
  const minutes = new Map<string, number>();
  for (const block of routine?.blocks ?? []) {
    const start = Date.parse(block.start);
    if (!week.has(utcToZonedParts(start, timezone).date)) continue;
    const length = (Date.parse(block.end) - start) / 60_000;
    minutes.set(block.taskId, (minutes.get(block.taskId) ?? 0) + length);
  }
  const flags = new Map<string, StationFlag>(
    (routine?.unscheduled ?? []).map((item) => [
      item.taskId,
      item.reason === 'PARTIAL' ? 'PARTIAL' : 'LEFT_OUT',
    ]),
  );

  const groups = new Map<string | null, Station[]>();
  for (const task of tasks) {
    if (task.status === 'DONE') continue;
    const key =
      task.commitmentId && lineOrder.includes(task.commitmentId) ? task.commitmentId : null;
    const list = groups.get(key) ?? [];
    list.push({
      task,
      weekMinutes: minutes.get(task.id) ?? 0,
      flag: flags.get(task.id) ?? null,
    });
    groups.set(key, list);
  }

  return [...lineOrder, null]
    .filter((key) => groups.has(key))
    .map((key) => ({
      commitmentId: key,
      stations: (groups.get(key) ?? []).sort((a, b) =>
        a.task.deadline.localeCompare(b.task.deadline),
      ),
    }));
}
