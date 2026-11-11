import { describe, expect, it } from 'vitest';
import {
  addDays,
  ceilMinutesToGrid,
  ceilToGrid,
  dateRange,
  dayOfWeekOf,
  diffInDays,
  fromLocalDateTime,
  isOnGrid,
  isValidTimeZone,
  minutesToTime,
  roundToGrid,
  startOfWeek,
  timeToMinutes,
  toLocalDateTime,
  utcToZonedParts,
  weekDates,
  zonedToUtcMs,
} from './time';

const MANAUS = 'America/Manaus'; // UTC-4, no DST

describe('time helpers', () => {
  it('converts between HH:mm and minutes', () => {
    expect(timeToMinutes('08:30')).toBe(510);
    expect(minutesToTime(510)).toBe('08:30');
    expect(minutesToTime(0)).toBe('00:00');
    expect(() => timeToMinutes('24:00')).toThrow(RangeError);
    expect(() => timeToMinutes('8:30')).toThrow(RangeError);
    expect(() => minutesToTime(1440)).toThrow(RangeError);
    expect(() => minutesToTime(1.5)).toThrow(RangeError);
  });

  it('converts wall-clock time in a timezone to an instant and back', () => {
    const instant = zonedToUtcMs('2026-11-10', 8 * 60, MANAUS);
    expect(new Date(instant).toISOString()).toBe('2026-11-10T12:00:00.000Z');
    expect(utcToZonedParts(instant, MANAUS)).toEqual({
      date: '2026-11-10',
      minutes: 480,
      dayOfWeek: 2,
    });
    expect(utcToZonedParts(new Date(instant), 'UTC').minutes).toBe(720);
  });

  it('rolls the calendar date across the timezone boundary', () => {
    const lateUtc = Date.parse('2026-11-11T02:00:00.000Z');
    expect(utcToZonedParts(lateUtc, MANAUS).date).toBe('2026-11-10');
  });

  it('handles daylight saving time zones', () => {
    // 2026-03-08 is the US spring-forward day: 08:00 EDT = 12:00 UTC
    const instant = zonedToUtcMs('2026-03-08', 8 * 60, 'America/New_York');
    expect(new Date(instant).toISOString()).toBe('2026-03-08T12:00:00.000Z');
  });

  it('does calendar arithmetic on date strings', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dayOfWeekOf('2026-11-10')).toBe(2);
    expect(diffInDays('2026-11-10', '2026-11-17')).toBe(7);
    expect(diffInDays('2026-11-10', '2026-11-09')).toBe(-1);
    expect(dateRange('2026-11-10', 3)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(dateRange('2026-11-10', -1)).toEqual([]);
    expect(() => addDays('10/11/2026', 1)).toThrow(RangeError);
  });

  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-11-10')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09'); // Sunday belongs to the previous Monday
    expect(weekDates('2026-11-09')).toHaveLength(7);
    expect(weekDates('2026-11-09')[6]).toBe('2026-11-15');
  });

  it('round-trips the local datetime format used by the LLM', () => {
    const instant = fromLocalDateTime('2026-11-10T14:15', MANAUS);
    expect(new Date(instant).toISOString()).toBe('2026-11-10T18:15:00.000Z');
    expect(toLocalDateTime(instant, MANAUS)).toBe('2026-11-10T14:15');
    expect(() => fromLocalDateTime('2026-11-10 14:15', MANAUS)).toThrow(RangeError);
  });

  it('snaps to the 15 minute grid', () => {
    const base = Date.parse('2026-11-10T12:00:00.000Z');
    expect(isOnGrid(base)).toBe(true);
    expect(isOnGrid(base + 60_000)).toBe(false);
    expect(ceilToGrid(base + 60_000)).toBe(base + 15 * 60_000);
    expect(ceilToGrid(base)).toBe(base);
    expect(roundToGrid(base + 7 * 60_000)).toBe(base);
    expect(roundToGrid(base + 8 * 60_000)).toBe(base + 15 * 60_000);
    expect(ceilMinutesToGrid(50)).toBe(60);
    expect(ceilMinutesToGrid(45)).toBe(45);
  });

  it('validates IANA timezones', () => {
    expect(isValidTimeZone(MANAUS)).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});
