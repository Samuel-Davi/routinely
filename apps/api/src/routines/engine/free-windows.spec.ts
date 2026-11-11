import { toLocalDateTime } from '@routinely/shared';
import { at, block, context, prefs, workWeek } from './fixtures';
import { computeFreeWindows, padBlocks, totalMinutes } from './free-windows';

const format = (windows: { start: number; end: number }[]) =>
  windows.map(
    (window) =>
      `${toLocalDateTime(window.start, prefs.timezone)}–${toLocalDateTime(window.end, prefs.timezone).slice(11)}`,
  );
const monday = { rangeStart: '2026-11-09', rangeEnd: '2026-11-09' };

describe('computeFreeWindows', () => {
  it('returns the daily window minus the protected lunch', () => {
    expect(format(computeFreeWindows(context(monday)))).toEqual([
      '2026-11-09T07:00–12:00',
      '2026-11-09T13:00–22:00',
    ]);
  });

  it('removes fixed commitments', () => {
    expect(format(computeFreeWindows(context({ ...monday, commitments: workWeek })))).toEqual([
      '2026-11-09T07:00–08:00',
      '2026-11-09T17:00–22:00',
    ]);
  });

  it('treats overlapping commitments as the union of their intervals', () => {
    // Friday: Aula de Ética 16–18 overlaps Piola 17–19.
    const friday = { rangeStart: '2026-11-13', rangeEnd: '2026-11-13' };
    const commitments = [
      { id: 'etica', daysOfWeek: [5], startTime: '16:00', endTime: '18:00' },
      { id: 'piola', daysOfWeek: [5], startTime: '17:00', endTime: '19:00' },
    ];
    expect(format(computeFreeWindows(context({ ...friday, commitments })))).toEqual([
      '2026-11-13T07:00–12:00',
      '2026-11-13T13:00–16:00',
      '2026-11-13T19:00–22:00',
    ]);
  });

  it('only applies commitments on their weekdays', () => {
    const saturday = { rangeStart: '2026-11-14', rangeEnd: '2026-11-14' };
    expect(format(computeFreeWindows(context({ ...saturday, commitments: workWeek })))).toEqual([
      '2026-11-14T07:00–12:00',
      '2026-11-14T13:00–22:00',
    ]);
  });

  it('never offers time before now, rounding up to the grid', () => {
    const windows = computeFreeWindows(context({ ...monday, now: at('2026-11-09T09:07') }));
    expect(format(windows)[0]).toBe('2026-11-09T09:15–12:00');
  });

  it('skips days that are already over', () => {
    const windows = computeFreeWindows(
      context({ rangeStart: '2026-11-09', rangeEnd: '2026-11-10', now: at('2026-11-09T23:00') }),
    );
    expect(format(windows)).toEqual(['2026-11-10T07:00–12:00', '2026-11-10T13:00–22:00']);
  });

  it('keeps locked blocks and the break around them out of the free time', () => {
    const windows = computeFreeWindows(
      context({
        ...monday,
        commitments: workWeek,
        fixedBlocks: [block('t1', '2026-11-09T18:00', '2026-11-09T19:00')],
      }),
    );
    expect(format(windows)).toEqual([
      '2026-11-09T07:00–08:00',
      '2026-11-09T17:00–17:45',
      '2026-11-09T19:15–22:00',
    ]);
  });

  it('also removes blocks placed during planning', () => {
    const windows = computeFreeWindows(context({ ...monday, commitments: workWeek }), [
      block('t1', '2026-11-09T17:00', '2026-11-09T18:30'),
    ]);
    expect(format(windows)).toEqual(['2026-11-09T07:00–08:00', '2026-11-09T18:45–22:00']);
  });

  it('snaps windows inward when preferences are off the grid', () => {
    const windows = computeFreeWindows(
      context({
        ...monday,
        prefs: { ...prefs, dayStart: '07:10', lunchStart: '11:50', dayEnd: '21:55' },
      }),
    );
    expect(format(windows)).toEqual(['2026-11-09T07:15–11:45', '2026-11-09T13:00–21:45']);
  });

  it('drops slivers shorter than one grid slot', () => {
    const windows = computeFreeWindows(
      context({
        ...monday,
        commitments: [{ id: 'c', daysOfWeek: [1], startTime: '07:10', endTime: '22:00' }],
      }),
    );
    expect(windows).toEqual([]);
  });

  it('returns nothing for a fully booked day', () => {
    const windows = computeFreeWindows(
      context({
        ...monday,
        commitments: [{ id: 'c', daysOfWeek: [1], startTime: '07:00', endTime: '22:00' }],
      }),
    );
    expect(windows).toEqual([]);
  });

  it('ignores an empty lunch break', () => {
    const windows = computeFreeWindows(
      context({ ...monday, prefs: { ...prefs, lunchStart: '12:00', lunchEnd: '12:00' } }),
    );
    expect(format(windows)).toEqual(['2026-11-09T07:00–22:00']);
  });

  it('covers every day of the range', () => {
    const windows = computeFreeWindows(context());
    expect(windows).toHaveLength(14);
    expect(totalMinutes(windows)).toBe(7 * 14 * 60);
  });
});

describe('padBlocks', () => {
  it('adds the break on both sides', () => {
    expect(padBlocks([{ start: 1_000_000, end: 2_000_000 }], 15)).toEqual([
      { start: 1_000_000 - 900_000, end: 2_000_000 + 900_000 },
    ]);
    expect(padBlocks([{ start: 10, end: 20 }], 0)).toEqual([{ start: 10, end: 20 }]);
  });
});
