import { describe, expect, it } from 'vitest';
import {
  checkPlacement,
  dayWindow,
  durationMinutes,
  expandCommitments,
  lunchInterval,
  mergeIntervals,
  overlaps,
  subtractIntervals,
  type PlacementContext,
  type SchedulingPreferences,
} from './scheduling';
import { fromLocalDateTime } from './time';

const prefs: SchedulingPreferences = {
  dayStart: '07:00',
  dayEnd: '22:00',
  maxFocusBlockMinutes: 90,
  minBreakMinutes: 15,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  timezone: 'America/Manaus',
};
const at = (local: string) => fromLocalDateTime(local, prefs.timezone);
const block = (start: string, end: string) => ({ start: at(start), end: at(end) });

// 2026-11-10 is a Tuesday
const context: PlacementContext = {
  prefs,
  commitments: [{ id: 'c1', daysOfWeek: [2, 4], startTime: '08:00', endTime: '10:00' }],
  otherBlocks: [block('2026-11-10T15:00', '2026-11-10T16:00')],
  deadline: at('2026-11-10T20:00'),
};

describe('interval helpers', () => {
  it('detects overlap on half-open intervals', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    expect(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 })).toBe(true);
    expect(durationMinutes({ start: 0, end: 900_000 })).toBe(15);
  });

  it('merges overlapping and touching intervals', () => {
    expect(
      mergeIntervals([
        { start: 30, end: 40 },
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 5, end: 8 },
        { start: 50, end: 50 },
      ]),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 40 },
    ]);
  });

  it('subtracts busy time from a window', () => {
    expect(
      subtractIntervals({ start: 0, end: 100 }, [
        { start: -10, end: 5 },
        { start: 20, end: 30 },
        { start: 90, end: 120 },
        { start: 200, end: 300 },
      ]),
    ).toEqual([
      { start: 5, end: 20 },
      { start: 30, end: 90 },
    ]);
    expect(subtractIntervals({ start: 0, end: 10 }, [])).toEqual([{ start: 0, end: 10 }]);
    expect(subtractIntervals({ start: 0, end: 10 }, [{ start: 0, end: 10 }])).toEqual([]);
  });

  it('builds the day window and lunch interval in the user timezone', () => {
    expect(new Date(dayWindow('2026-11-10', prefs).start).toISOString()).toBe(
      '2026-11-10T11:00:00.000Z',
    );
    expect(durationMinutes(lunchInterval('2026-11-10', prefs))).toBe(60);
  });

  it('expands weekly commitments into occurrences', () => {
    const occurrences = expandCommitments(context.commitments, '2026-11-09', 7, prefs.timezone);
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]).toMatchObject({ commitmentId: 'c1', start: at('2026-11-10T08:00') });
    expect(occurrences[1]?.start).toBe(at('2026-11-12T08:00'));
  });
});

describe('checkPlacement', () => {
  it('accepts a valid block', () => {
    expect(checkPlacement(block('2026-11-10T10:00', '2026-11-10T11:30'), context)).toEqual([]);
  });

  it('accepts a block touching a commitment, lunch and another block', () => {
    expect(checkPlacement(block('2026-11-10T11:00', '2026-11-10T12:00'), context)).toEqual([]);
    expect(checkPlacement(block('2026-11-10T14:00', '2026-11-10T15:00'), context)).toEqual([]);
  });

  it('rejects empty, inverted or non-finite ranges', () => {
    expect(checkPlacement(block('2026-11-10T10:00', '2026-11-10T10:00'), context)).toEqual([
      'INVALID_RANGE',
    ]);
    expect(checkPlacement(block('2026-11-10T11:00', '2026-11-10T10:00'), context)).toEqual([
      'INVALID_RANGE',
    ]);
    expect(checkPlacement({ start: Number.NaN, end: 1 }, context)).toEqual(['INVALID_RANGE']);
  });

  it('rejects blocks off the 15 minute grid', () => {
    const offGrid = { start: at('2026-11-10T10:00') + 60_000, end: at('2026-11-10T11:00') };
    expect(checkPlacement(offGrid, context)).toContain('OFF_GRID');
  });

  it('rejects overlap with a fixed commitment', () => {
    expect(checkPlacement(block('2026-11-10T09:30', '2026-11-10T10:30'), context)).toEqual([
      'OVERLAPS_COMMITMENT',
    ]);
  });

  it('ignores commitments of other weekdays', () => {
    expect(
      checkPlacement(block('2026-11-11T08:00', '2026-11-11T09:00'), { ...context, deadline: null }),
    ).toEqual([]);
  });

  it('rejects overlap with the protected lunch break', () => {
    expect(checkPlacement(block('2026-11-10T11:30', '2026-11-10T12:30'), context)).toEqual([
      'OVERLAPS_LUNCH',
    ]);
  });

  it('rejects overlap with another task block', () => {
    expect(checkPlacement(block('2026-11-10T15:30', '2026-11-10T16:30'), context)).toEqual([
      'OVERLAPS_BLOCK',
    ]);
  });

  it('rejects blocks outside the daily window', () => {
    expect(checkPlacement(block('2026-11-10T06:30', '2026-11-10T07:30'), context)).toEqual([
      'OUTSIDE_DAY_WINDOW',
    ]);
    expect(
      checkPlacement(block('2026-11-10T21:30', '2026-11-10T22:15'), { ...context, deadline: null }),
    ).toEqual(['OUTSIDE_DAY_WINDOW']);
  });

  it('rejects blocks spanning two days', () => {
    const violations = checkPlacement(block('2026-11-10T23:30', '2026-11-11T00:30'), {
      ...context,
      deadline: null,
    });
    expect(violations).toEqual(expect.arrayContaining(['CROSSES_DAYS', 'OUTSIDE_DAY_WINDOW']));
  });

  it('rejects blocks ending after the deadline', () => {
    expect(checkPlacement(block('2026-11-10T19:30', '2026-11-10T20:15'), context)).toEqual([
      'AFTER_DEADLINE',
    ]);
    expect(checkPlacement(block('2026-11-10T19:00', '2026-11-10T20:00'), context)).toEqual([]);
  });

  it('rejects blocks longer than the max focus block', () => {
    expect(checkPlacement(block('2026-11-10T16:00', '2026-11-10T17:45'), context)).toEqual([
      'EXCEEDS_MAX_BLOCK',
    ]);
  });

  it('rejects blocks starting before now when a clock is given', () => {
    const candidate = block('2026-11-10T10:00', '2026-11-10T11:00');
    expect(checkPlacement(candidate, { ...context, now: at('2026-11-10T10:30') })).toEqual([
      'IN_THE_PAST',
    ]);
    expect(checkPlacement(candidate, { ...context, now: at('2026-11-10T10:00') })).toEqual([]);
  });

  it('reports every violation at once', () => {
    const violations = checkPlacement(block('2026-11-10T08:00', '2026-11-10T12:30'), context);
    expect(violations).toEqual(
      expect.arrayContaining(['OVERLAPS_COMMITMENT', 'OVERLAPS_LUNCH', 'EXCEEDS_MAX_BLOCK']),
    );
  });
});
