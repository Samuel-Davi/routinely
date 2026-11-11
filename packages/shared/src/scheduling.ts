import type { PlacementViolation } from './enums';
import {
  GRID_MINUTES,
  MINUTE_MS,
  dateRange,
  dayOfWeekOf,
  isOnGrid,
  timeToMinutes,
  utcToZonedParts,
  zonedToUtcMs,
  type DateString,
} from './time';

/** Half-open interval `[start, end)` in epoch milliseconds. */
export interface Interval {
  start: number;
  end: number;
}

export interface SchedulingPreferences {
  dayStart: string;
  dayEnd: string;
  maxFocusBlockMinutes: number;
  minBreakMinutes: number;
  lunchStart: string;
  lunchEnd: string;
  /** Minutes blocked after the day's last commitment that requires travel (0 = off). */
  travelMinutes?: number;
  timezone: string;
}

export interface SchedulingCommitment {
  id: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  requiresTravel?: boolean;
}

export interface CommitmentOccurrence extends Interval {
  commitmentId: string;
}

export const overlaps = (a: Interval, b: Interval): boolean => a.start < b.end && b.start < a.end;

export const durationMinutes = (interval: Interval): number =>
  (interval.end - interval.start) / MINUTE_MS;

/** Sorts and merges touching/overlapping intervals. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ start: interval.start, end: interval.end });
  }
  return merged;
}

/** Removes every `busy` interval from `base`, returning what is left. */
export function subtractIntervals(base: Interval, busy: readonly Interval[]): Interval[] {
  const free: Interval[] = [];
  let cursor = base.start;
  for (const interval of mergeIntervals(busy)) {
    if (interval.end <= cursor) continue;
    if (interval.start >= base.end) break;
    if (interval.start > cursor) free.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < base.end) free.push({ start: cursor, end: base.end });
  return free;
}

/** The daily routine window of `date`. */
export function dayWindow(date: DateString, prefs: SchedulingPreferences): Interval {
  return {
    start: zonedToUtcMs(date, timeToMinutes(prefs.dayStart), prefs.timezone),
    end: zonedToUtcMs(date, timeToMinutes(prefs.dayEnd), prefs.timezone),
  };
}

/** The protected lunch/rest interval of `date`. */
export function lunchInterval(date: DateString, prefs: SchedulingPreferences): Interval {
  return {
    start: zonedToUtcMs(date, timeToMinutes(prefs.lunchStart), prefs.timezone),
    end: zonedToUtcMs(date, timeToMinutes(prefs.lunchEnd), prefs.timezone),
  };
}

/** Concrete occurrences of weekly commitments for `days` days starting at `startDate`. */
export function expandCommitments(
  commitments: readonly SchedulingCommitment[],
  startDate: DateString,
  days: number,
  timeZone: string,
): CommitmentOccurrence[] {
  const occurrences: CommitmentOccurrence[] = [];
  for (const date of dateRange(startDate, days)) {
    const dow = dayOfWeekOf(date);
    for (const commitment of commitments) {
      if (!commitment.daysOfWeek.includes(dow)) continue;
      occurrences.push({
        commitmentId: commitment.id,
        start: zonedToUtcMs(date, timeToMinutes(commitment.startTime), timeZone),
        end: zonedToUtcMs(date, timeToMinutes(commitment.endTime), timeZone),
      });
    }
  }
  return occurrences.sort((a, b) => a.start - b.start);
}

/**
 * Travel time of `date`: starts when the day's **last** commitment that requires travel
 * ends and lasts `travelMinutes`, clipped to the daily window. `null` when there is none.
 */
export function travelInterval(
  date: DateString,
  commitments: readonly SchedulingCommitment[],
  prefs: SchedulingPreferences,
): Interval | null {
  const minutes = prefs.travelMinutes ?? 0;
  if (minutes <= 0) return null;
  const dow = dayOfWeekOf(date);
  const ends = commitments
    .filter((commitment) => commitment.requiresTravel && commitment.daysOfWeek.includes(dow))
    .map((commitment) => timeToMinutes(commitment.endTime));
  if (ends.length === 0) return null;
  const start = zonedToUtcMs(date, Math.max(...ends), prefs.timezone);
  const end = Math.min(start + minutes * MINUTE_MS, dayWindow(date, prefs).end);
  return end > start ? { start, end } : null;
}

export interface CommitmentOverlap {
  /** Ids of the two commitments, in input order. */
  a: string;
  b: string;
  /** Weekdays (0–6) on which they share time. */
  daysOfWeek: number[];
}

/** Pairs of weekly commitments that share time on at least one weekday. */
export function findCommitmentOverlaps(
  commitments: readonly SchedulingCommitment[],
): CommitmentOverlap[] {
  const overlapsFound: CommitmentOverlap[] = [];
  commitments.forEach((first, index) => {
    for (const second of commitments.slice(index + 1)) {
      const sameTime = first.startTime < second.endTime && second.startTime < first.endTime;
      const days = first.daysOfWeek.filter((day) => second.daysOfWeek.includes(day));
      if (sameTime && days.length > 0) {
        overlapsFound.push({ a: first.id, b: second.id, daysOfWeek: [...days].sort() });
      }
    }
  });
  return overlapsFound;
}

export interface TravelConflict {
  /** The commitment whose travel time is cut short. */
  commitmentId: string;
  /** The commitment that starts before the travel ends. */
  nextCommitmentId: string;
  dayOfWeek: number;
  /** "HH:mm" when the travel would end. */
  travelEnd: string;
}

/**
 * Commitments that start before the travel time of the same day is over. Purely
 * informational: the user decides what to do about it.
 */
export function findTravelConflicts(
  commitments: readonly SchedulingCommitment[],
  travelMinutes: number,
): TravelConflict[] {
  if (travelMinutes <= 0) return [];
  const conflicts: TravelConflict[] = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    const today = commitments.filter((commitment) => commitment.daysOfWeek.includes(dayOfWeek));
    const travelling = today
      .filter((commitment) => commitment.requiresTravel)
      .sort((a, b) => a.endTime.localeCompare(b.endTime));
    const last = travelling[travelling.length - 1];
    if (!last) continue;
    const travelStart = timeToMinutes(last.endTime);
    const travelEnd = Math.min(travelStart + travelMinutes, 24 * 60 - 1);
    for (const next of today) {
      const start = timeToMinutes(next.startTime);
      if (next.id !== last.id && start >= travelStart && start < travelEnd) {
        conflicts.push({
          commitmentId: last.id,
          nextCommitmentId: next.id,
          dayOfWeek,
          travelEnd: `${String(Math.floor(travelEnd / 60)).padStart(2, '0')}:${String(travelEnd % 60).padStart(2, '0')}`,
        });
      }
    }
  }
  return conflicts;
}

export interface PlacementContext {
  prefs: SchedulingPreferences;
  commitments: readonly SchedulingCommitment[];
  /** Other task blocks already on the calendar (exclude the block being moved). */
  otherBlocks: readonly Interval[];
  /** Deadline of the block's task, epoch ms. */
  deadline?: number | null;
  /** When set, blocks starting before this instant are rejected. */
  now?: number | null;
}

/**
 * Checks a single task block against every hard rule. Shared by the API (source of
 * truth) and the web app (live feedback while dragging). Returns `[]` when valid.
 */
export function checkPlacement(block: Interval, context: PlacementContext): PlacementViolation[] {
  const { prefs } = context;
  const violations = new Set<PlacementViolation>();

  if (
    !Number.isFinite(block.start) ||
    !Number.isFinite(block.end) ||
    block.end - block.start < GRID_MINUTES * MINUTE_MS
  ) {
    return ['INVALID_RANGE'];
  }
  if (!isOnGrid(block.start) || !isOnGrid(block.end)) violations.add('OFF_GRID');

  const startParts = utcToZonedParts(block.start, prefs.timezone);
  const endParts = utcToZonedParts(block.end - 1, prefs.timezone);
  if (startParts.date !== endParts.date) {
    violations.add('CROSSES_DAYS');
    violations.add('OUTSIDE_DAY_WINDOW');
  } else {
    const window = dayWindow(startParts.date, prefs);
    if (block.start < window.start || block.end > window.end) violations.add('OUTSIDE_DAY_WINDOW');
    if (overlaps(block, lunchInterval(startParts.date, prefs))) violations.add('OVERLAPS_LUNCH');
    const occurrences = expandCommitments(context.commitments, startParts.date, 1, prefs.timezone);
    if (occurrences.some((occurrence) => overlaps(block, occurrence))) {
      violations.add('OVERLAPS_COMMITMENT');
    }
    const travel = travelInterval(startParts.date, context.commitments, prefs);
    if (travel && overlaps(block, travel)) violations.add('OVERLAPS_TRAVEL');
  }

  if (context.otherBlocks.some((other) => overlaps(block, other))) violations.add('OVERLAPS_BLOCK');
  if (context.deadline != null && block.end > context.deadline) violations.add('AFTER_DEADLINE');
  if (durationMinutes(block) > prefs.maxFocusBlockMinutes) violations.add('EXCEEDS_MAX_BLOCK');
  if (context.now != null && block.start < context.now) violations.add('IN_THE_PAST');

  return [...violations];
}
