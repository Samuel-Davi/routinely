import { TZDate } from '@date-fns/tz';

/** Every allocation snaps to this grid (minutes). */
export const GRID_MINUTES = 15;
export const MINUTE_MS = 60_000;
export const DAY_MINUTES = 24 * 60;
export const DEFAULT_TIMEZONE = 'America/Manaus';
/** Hard cap on how far ahead a routine may be planned. */
export const MAX_PLANNING_WEEKS = 4;

export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const LOCAL_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/** Calendar date in the user's timezone, `YYYY-MM-DD`. */
export type DateString = string;

const pad = (value: number): string => String(value).padStart(2, '0');

/** `"08:30"` → `510`. */
export function timeToMinutes(time: string): number {
  if (!TIME_REGEX.test(time)) throw new RangeError(`Invalid time: ${time}`);
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** `510` → `"08:30"`. */
export function minutesToTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= DAY_MINUTES) {
    throw new RangeError(`Invalid minutes of day: ${minutes}`);
  }
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function splitDate(date: DateString): [number, number, number] {
  if (!DATE_REGEX.test(date)) throw new RangeError(`Invalid date: ${date}`);
  return date.split('-').map(Number) as [number, number, number];
}

function formatDate(year: number, monthIndex: number, day: number): DateString {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

/** Instant (epoch ms) of `date` at `minutesOfDay` wall-clock time in `timeZone`. */
export function zonedToUtcMs(date: DateString, minutesOfDay: number, timeZone: string): number {
  const [year, month, day] = splitDate(date);
  return new TZDate(year, month - 1, day, 0, minutesOfDay, 0, 0, timeZone).getTime();
}

export interface ZonedParts {
  date: DateString;
  minutes: number;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
}

/** Wall-clock parts of an instant in `timeZone`. */
export function utcToZonedParts(instant: number | Date, timeZone: string): ZonedParts {
  const zoned = new TZDate(typeof instant === 'number' ? instant : instant.getTime(), timeZone);
  return {
    date: formatDate(zoned.getFullYear(), zoned.getMonth(), zoned.getDate()),
    minutes: zoned.getHours() * 60 + zoned.getMinutes(),
    dayOfWeek: zoned.getDay(),
  };
}

/** Pure calendar arithmetic on a `YYYY-MM-DD` string. */
export function addDays(date: DateString, amount: number): DateString {
  const [year, month, day] = splitDate(date);
  const utc = new Date(Date.UTC(year, month - 1, day + amount));
  return formatDate(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

export function dayOfWeekOf(date: DateString): number {
  const [year, month, day] = splitDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffInDays(from: DateString, to: DateString): number {
  const [fy, fm, fd] = splitDate(from);
  const [ty, tm, td] = splitDate(to);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / (DAY_MINUTES * MINUTE_MS),
  );
}

/** Monday of the week containing `date` (weeks run Monday → Sunday). */
export function startOfWeek(date: DateString): DateString {
  const dow = dayOfWeekOf(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function weekDates(weekStart: DateString): DateString[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** `["2026-11-09", …]` for `count` consecutive days. */
export function dateRange(start: DateString, count: number): DateString[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(start, index));
}

/** Instant → `YYYY-MM-DDTHH:mm` wall-clock string in `timeZone` (format the LLM reads/writes). */
export function toLocalDateTime(instant: number | Date, timeZone: string): string {
  const parts = utcToZonedParts(instant, timeZone);
  return `${parts.date}T${minutesToTime(parts.minutes)}`;
}

/** `YYYY-MM-DDTHH:mm` wall-clock string in `timeZone` → instant (epoch ms). */
export function fromLocalDateTime(local: string, timeZone: string): number {
  if (!LOCAL_DATETIME_REGEX.test(local)) throw new RangeError(`Invalid local datetime: ${local}`);
  const [date, time] = local.split('T') as [string, string];
  return zonedToUtcMs(date, timeToMinutes(time), timeZone);
}

export function isOnGrid(instant: number): boolean {
  return instant % (GRID_MINUTES * MINUTE_MS) === 0;
}

export function ceilToGrid(instant: number): number {
  const grid = GRID_MINUTES * MINUTE_MS;
  return Math.ceil(instant / grid) * grid;
}

export function roundToGrid(instant: number): number {
  const grid = GRID_MINUTES * MINUTE_MS;
  return Math.round(instant / grid) * grid;
}

export function ceilMinutesToGrid(minutes: number): number {
  return Math.ceil(minutes / GRID_MINUTES) * GRID_MINUTES;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
