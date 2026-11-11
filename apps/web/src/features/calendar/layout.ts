import {
  GRID_MINUTES,
  MINUTE_MS,
  dayOfWeekOf,
  timeToMinutes,
  utcToZonedParts,
  zonedToUtcMs,
  type DateString,
  type FixedCommitment,
  type Preferences,
  type Priority,
  type RoutineBlock,
} from '@routinely/shared';

/** Pixels per hour of the time grid. One 15 minute slot is a quarter of it. */
export const HOUR_HEIGHT = 56;
export const SLOT_HEIGHT = HOUR_HEIGHT / (60 / GRID_MINUTES);

export interface GridBounds {
  /** Minutes of day, rounded outward to whole hours. */
  startMinutes: number;
  endMinutes: number;
}

/** The visible hours: the daily window, rounded outward to full hours. */
export function gridBounds(prefs: Pick<Preferences, 'dayStart' | 'dayEnd'>): GridBounds {
  return {
    startMinutes: Math.floor(timeToMinutes(prefs.dayStart) / 60) * 60,
    endMinutes: Math.ceil(timeToMinutes(prefs.dayEnd) / 60) * 60,
  };
}

export const gridHeight = (bounds: GridBounds): number =>
  ((bounds.endMinutes - bounds.startMinutes) / 60) * HOUR_HEIGHT;

export const hourLabels = (bounds: GridBounds): number[] =>
  Array.from(
    { length: (bounds.endMinutes - bounds.startMinutes) / 60 + 1 },
    (_, index) => bounds.startMinutes / 60 + index,
  );

export interface Box {
  top: number;
  height: number;
}

/** Vertical position of a `[start, end)` range of minutes, clipped to the grid. */
export function boxFor(startMinutes: number, endMinutes: number, bounds: GridBounds): Box | null {
  const start = Math.max(startMinutes, bounds.startMinutes);
  const end = Math.min(endMinutes, bounds.endMinutes);
  if (end <= start) return null;
  return {
    top: ((start - bounds.startMinutes) / 60) * HOUR_HEIGHT,
    height: ((end - start) / 60) * HOUR_HEIGHT,
  };
}

export interface PositionedCommitment extends Box {
  commitment: FixedCommitment;
}

export function commitmentsForDay(
  date: DateString,
  commitments: readonly FixedCommitment[],
  bounds: GridBounds,
): PositionedCommitment[] {
  const dow = dayOfWeekOf(date);
  return commitments
    .filter((commitment) => commitment.daysOfWeek.includes(dow))
    .flatMap((commitment) => {
      const box = boxFor(
        timeToMinutes(commitment.startTime),
        timeToMinutes(commitment.endTime),
        bounds,
      );
      return box ? [{ commitment, ...box }] : [];
    })
    .sort((a, b) => a.top - b.top);
}

export interface PositionedBlock extends Box {
  block: RoutineBlock;
  startMinutes: number;
  endMinutes: number;
}

/** Blocks that start on `date` (in the user's timezone), positioned on the grid. */
export function blocksForDay(
  date: DateString,
  blocks: readonly RoutineBlock[],
  bounds: GridBounds,
  timeZone: string,
): PositionedBlock[] {
  return blocks
    .flatMap((block) => {
      const start = utcToZonedParts(Date.parse(block.start), timeZone);
      if (start.date !== date) return [];
      const endMinutes =
        start.minutes + (Date.parse(block.end) - Date.parse(block.start)) / MINUTE_MS;
      const box = boxFor(start.minutes, endMinutes, bounds);
      return box ? [{ block, startMinutes: start.minutes, endMinutes, ...box }] : [];
    })
    .sort((a, b) => a.top - b.top);
}

export interface BlockFilters {
  showCompleted: boolean;
  priorities: readonly Priority[];
}

export const isBlockDone = (block: RoutineBlock): boolean =>
  block.completedAt !== null || block.task.status === 'DONE';

export function filterBlocks(
  blocks: readonly RoutineBlock[],
  filters: BlockFilters,
): RoutineBlock[] {
  return blocks.filter(
    (block) =>
      (filters.showCompleted || !isBlockDone(block)) &&
      (filters.priorities.length === 0 || filters.priorities.includes(block.task.priority)),
  );
}

/** Y offset (px from the top of the grid) → minutes of day, snapped to the 15 minute grid. */
export function offsetToMinutes(offset: number, bounds: GridBounds): number {
  const minutes = bounds.startMinutes + (offset / HOUR_HEIGHT) * 60;
  return Math.round(minutes / GRID_MINUTES) * GRID_MINUTES;
}

/** A vertical pixel delta → whole grid steps, in minutes. */
export const deltaToMinutes = (deltaY: number): number =>
  Math.round(deltaY / SLOT_HEIGHT) * GRID_MINUTES;

/** Instant of `minutesOfDay` on `date` in the user's timezone. */
export const instantAt = (date: DateString, minutesOfDay: number, timeZone: string): number =>
  zonedToUtcMs(date, 0, timeZone) + minutesOfDay * MINUTE_MS;

/** Position of "now" on `date`'s column, or null when it is another day / off the grid. */
export function nowOffset(
  date: DateString,
  now: number,
  bounds: GridBounds,
  timeZone: string,
): number | null {
  const parts = utcToZonedParts(now, timeZone);
  if (
    parts.date !== date ||
    parts.minutes < bounds.startMinutes ||
    parts.minutes > bounds.endMinutes
  )
    return null;
  return ((parts.minutes - bounds.startMinutes) / 60) * HOUR_HEIGHT;
}

/**
 * Where a swipe will come to rest, given its release velocity (px/s): the same
 * exponential decay scroll views use, so a short flick still turns the page.
 */
export function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** `"2026-11-09"…"2026-11-15"` → "9 – 15 de nov. de 2026". */
export function formatWeekRange(dates: readonly DateString[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return '';
  const date = (value: string) => new Date(`${value}T00:00:00Z`);
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' });
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const end = fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(date(last));
  const start = sameMonth
    ? fmt({ day: 'numeric' }).format(date(first))
    : fmt({ day: 'numeric', month: 'short' }).format(date(first));
  return `${start} – ${end}`;
}
