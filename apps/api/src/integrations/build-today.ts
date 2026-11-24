import {
  addDays,
  minutesToTime,
  occursOn,
  utcToZonedParts,
  zonedToUtcMs,
  type DateString,
  type Priority,
  type TaskStatus,
  type Today,
} from '@routinely/shared';

export interface TodayInput {
  date: DateString;
  timezone: string;
  /** Blocks of the active routine (any day: the ones outside `date` are dropped here). */
  blocks: readonly {
    start: Date;
    end: Date;
    locked: boolean;
    completedAt: Date | null;
    task: { title: string; priority: Priority };
  }[];
  commitments: readonly {
    title: string;
    daysOfWeek: number[];
    date: string | null;
    startTime: string;
    endTime: string;
  }[];
  /** Tasks with a deadline (any day: the ones outside `date` are dropped here). */
  tasks: readonly { title: string; deadline: Date; priority: Priority; status: TaskStatus }[];
  routineNotice: string | null;
}

/** The instants where `date` starts and ends in `timeZone` (DST-safe: next local midnight). */
export function dayBounds(date: DateString, timeZone: string): { start: number; end: number } {
  return {
    start: zonedToUtcMs(date, 0, timeZone),
    end: zonedToUtcMs(addDays(date, 1), 0, timeZone),
  };
}

/**
 * What `date` looks like for an external reader: wall-clock times in the user's timezone, only
 * titles and states (no descriptions). A block that crosses midnight is clipped to the day, so
 * it reads "00:00" at the start or "24:00" at the end. Pure: no clock, no database.
 */
export function buildToday(input: TodayInput): Today {
  const { date, timezone } = input;
  const day = dayBounds(date, timezone);
  const clock = (instant: number): string =>
    instant >= day.end ? '24:00' : minutesToTime(utcToZonedParts(instant, timezone).minutes);

  const blocks = input.blocks
    .filter((block) => block.start.getTime() < day.end && block.end.getTime() > day.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((block) => ({
      start: clock(Math.max(block.start.getTime(), day.start)),
      end: clock(Math.min(block.end.getTime(), day.end)),
      title: block.task.title,
      done: block.completedAt !== null,
      locked: block.locked,
      priority: block.task.priority,
    }));

  const commitments = input.commitments
    .filter((commitment) => occursOn(commitment, date))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((commitment) => ({
      start: commitment.startTime,
      end: commitment.endTime,
      title: commitment.title,
      oneOff: commitment.date !== null,
    }));

  const tasksDue = input.tasks
    .filter((task) => task.deadline.getTime() >= day.start && task.deadline.getTime() < day.end)
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
    .map((task) => ({
      title: task.title,
      dueDate: date,
      priority: task.priority,
      done: task.status === 'DONE',
    }));

  return { date, timezone, blocks, commitments, tasksDue, routineNotice: input.routineNotice };
}
