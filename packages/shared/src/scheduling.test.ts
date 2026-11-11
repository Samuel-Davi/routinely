import { describe, expect, it } from 'vitest';
import {
  checkPlacement,
  dayWindow,
  durationMinutes,
  expandCommitments,
  findCommitmentOverlaps,
  findTravelConflicts,
  lunchInterval,
  mergeIntervals,
  overlaps,
  subtractIntervals,
  travelInterval,
  type PlacementContext,
  type SchedulingPreferences,
} from './scheduling';
import { fromLocalDateTime, toLocalDateTime } from './time';

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

describe('travel time', () => {
  const travelPrefs = { ...prefs, travelMinutes: 60 };
  const klass = (
    id: string,
    days: number[],
    startTime: string,
    endTime: string,
    requiresTravel = true,
  ) => ({
    id,
    daysOfWeek: days,
    startTime,
    endTime,
    requiresTravel,
  });
  const show = (interval: { start: number; end: number } | null) =>
    interval
      ? `${toLocalDateTime(interval.start, prefs.timezone)}–${toLocalDateTime(interval.end, prefs.timezone).slice(11)}`
      : null;

  it('is absent on a day without a commitment that requires travel', () => {
    const commitments = [
      klass('remote', [2], '08:00', '10:00', false),
      klass('other-day', [3], '14:00', '16:00'),
    ];
    expect(travelInterval('2026-11-10', commitments, travelPrefs)).toBeNull();
    expect(travelInterval('2026-11-10', [], travelPrefs)).toBeNull();
  });

  it('follows the single class of the day', () => {
    expect(
      show(travelInterval('2026-11-10', [klass('a', [2], '14:00', '16:00')], travelPrefs)),
    ).toBe('2026-11-10T16:00–17:00');
  });

  it('follows only the last class when there are several', () => {
    const commitments = [
      klass('a', [2], '14:00', '16:00'),
      klass('b', [2], '16:00', '18:00'),
      klass('remote', [2], '18:15', '21:15', false),
    ];
    expect(show(travelInterval('2026-11-10', commitments, travelPrefs))).toBe(
      '2026-11-10T18:00–19:00',
    );
  });

  it('is clipped when the class ends close to the end of the daily window', () => {
    expect(
      show(travelInterval('2026-11-10', [klass('a', [2], '19:30', '21:30')], travelPrefs)),
    ).toBe('2026-11-10T21:30–22:00');
  });

  it('disappears when it would start at or after the end of the window, or when disabled', () => {
    expect(
      travelInterval('2026-11-10', [klass('a', [2], '20:00', '22:00')], travelPrefs),
    ).toBeNull();
    expect(
      travelInterval('2026-11-10', [klass('a', [2], '14:00', '16:00')], {
        ...prefs,
        travelMinutes: 0,
      }),
    ).toBeNull();
    expect(travelInterval('2026-11-10', [klass('a', [2], '14:00', '16:00')], prefs)).toBeNull();
  });

  it('blocks task placement during the travel time', () => {
    const travelContext = {
      prefs: travelPrefs,
      commitments: [klass('a', [2], '14:00', '16:00')],
      otherBlocks: [],
    };
    expect(checkPlacement(block('2026-11-10T16:30', '2026-11-10T17:30'), travelContext)).toEqual([
      'OVERLAPS_TRAVEL',
    ]);
    expect(checkPlacement(block('2026-11-10T17:00', '2026-11-10T18:00'), travelContext)).toEqual(
      [],
    );
  });

  it('reports commitments that start before the travel is over', () => {
    const commitments = [
      klass('class', [2, 4], '16:00', '18:00'),
      klass('course', [2, 4], '18:15', '21:15', false),
      klass('late', [2], '19:00', '20:00', false),
    ];
    expect(findTravelConflicts(commitments, 60)).toEqual([
      { commitmentId: 'class', nextCommitmentId: 'course', dayOfWeek: 2, travelEnd: '19:00' },
      { commitmentId: 'class', nextCommitmentId: 'course', dayOfWeek: 4, travelEnd: '19:00' },
    ]);
    expect(findTravelConflicts(commitments, 15)).toEqual([]);
    expect(findTravelConflicts(commitments, 0)).toEqual([]);
  });
});

describe('findCommitmentOverlaps', () => {
  it('finds pairs that share time on a common weekday', () => {
    const commitments = [
      { id: 'etica', daysOfWeek: [5], startTime: '16:00', endTime: '18:00' },
      { id: 'piola', daysOfWeek: [5, 6], startTime: '17:00', endTime: '19:00' },
      { id: 'touching', daysOfWeek: [5], startTime: '19:00', endTime: '20:00' },
      { id: 'other-day', daysOfWeek: [1], startTime: '16:00', endTime: '18:00' },
    ];
    expect(findCommitmentOverlaps(commitments)).toEqual([
      { a: 'etica', b: 'piola', daysOfWeek: [5] },
    ]);
    expect(findCommitmentOverlaps([])).toEqual([]);
  });
});
