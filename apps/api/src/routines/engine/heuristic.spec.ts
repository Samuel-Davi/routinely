import { toLocalDateTime } from '@routinely/shared';
import { at, block, context, prefs, task, workWeek } from './fixtures';
import { compareTasks, scheduleHeuristic } from './heuristic';

const ctx = context({ commitments: workWeek });
const show = (blocks: { taskId: string; start: number; end: number }[]) =>
  blocks.map(
    (b) =>
      `${b.taskId} ${toLocalDateTime(b.start, prefs.timezone)}–${toLocalDateTime(b.end, prefs.timezone).slice(11)}`,
  );

describe('compareTasks', () => {
  it('orders by deadline, then priority, then complexity, then id', () => {
    const tasks = [
      task('d', { complexity: 1 }),
      task('c', { complexity: 5 }),
      task('b', { priority: 'URGENT' }),
      task('a', { deadline: at('2026-11-10T18:00'), priority: 'LOW' }),
      task('c2', { complexity: 5 }),
    ];
    expect([...tasks].sort(compareTasks).map((t) => t.id)).toEqual(['a', 'b', 'c', 'c2', 'd']);
  });
});

describe('scheduleHeuristic', () => {
  it('places tasks first-fit in priority order with breaks in between', () => {
    const result = scheduleHeuristic(
      [task('low', { priority: 'LOW' }), task('urgent', { priority: 'URGENT' })],
      ctx,
    );
    expect(show(result.blocks)).toEqual([
      'urgent 2026-11-09T07:00–08:00',
      'low 2026-11-09T17:00–18:00',
    ]);
    expect(result.unscheduled).toEqual([]);
  });

  it('splits a long task into blocks no longer than the max focus block', () => {
    const result = scheduleHeuristic([task('a', { minutes: 240 })], ctx);
    expect(show(result.blocks)).toEqual([
      'a 2026-11-09T07:00–08:00',
      'a 2026-11-09T17:00–18:30',
      'a 2026-11-09T18:45–20:15',
    ]);
  });

  it('keeps a splittable task whole when it fits in one focus block', () => {
    const result = scheduleHeuristic([task('a', { minutes: 90 })], ctx);
    expect(show(result.blocks)).toEqual(['a 2026-11-09T17:00–18:30']);
  });

  it('splits a short task only when no window takes it whole', () => {
    const result = scheduleHeuristic(
      [task('a', { minutes: 90, deadline: at('2026-11-09T17:30') })],
      ctx,
    );
    expect(show(result.blocks)).toEqual(['a 2026-11-09T07:00–08:00', 'a 2026-11-09T17:00–17:30']);
  });

  it('avoids 15 minute crumbs when a later window fits a bigger piece', () => {
    // Monday evening: 17:00–18:45 free, then a commitment, then 20:00–22:00.
    const evening = context({
      commitments: [
        ...workWeek,
        { id: 'c', daysOfWeek: [1], startTime: '18:45', endTime: '20:00' },
        { id: 'm', daysOfWeek: [1], startTime: '07:00', endTime: '08:00' },
      ],
    });
    const result = scheduleHeuristic([task('a', { minutes: 150 })], evening);
    // 90 min, then the 15 min left before 18:45 is skipped in favour of 60 min at 20:00
    expect(show(result.blocks)).toEqual(['a 2026-11-09T17:00–18:30', 'a 2026-11-09T20:00–21:00']);
  });

  it('still uses 15 minute pieces when nothing else makes the task fit', () => {
    const tight = context({
      rangeEnd: '2026-11-09',
      commitments: [{ id: 'c', daysOfWeek: [1], startTime: '07:15', endTime: '21:00' }],
    });
    const result = scheduleHeuristic(
      [task('a', { minutes: 75, deadline: at('2026-11-09T22:00') })],
      tight,
    );
    expect(show(result.blocks)).toEqual(['a 2026-11-09T07:00–07:15', 'a 2026-11-09T21:00–22:00']);
  });

  it('puts an unsplittable task in the first window that takes it whole', () => {
    const result = scheduleHeuristic([task('a', { minutes: 90, splittable: false })], ctx);
    expect(show(result.blocks)).toEqual(['a 2026-11-09T17:00–18:30']);
  });

  it('never schedules past the deadline: an impossible deadline is reported', () => {
    const result = scheduleHeuristic(
      [task('a', { minutes: 180, deadline: at('2026-11-09T18:00') })],
      ctx,
    );
    expect(result.blocks).toEqual([]);
    expect(result.unscheduled).toEqual([
      { taskId: 'a', reason: 'DEADLINE_IMPOSSIBLE', missingMinutes: 60 },
    ]);
  });

  it('uses the time right up to the deadline', () => {
    const result = scheduleHeuristic(
      [task('a', { minutes: 120, deadline: at('2026-11-09T18:00') })],
      ctx,
    );
    expect(show(result.blocks)).toEqual(['a 2026-11-09T07:00–08:00', 'a 2026-11-09T17:00–18:00']);
  });

  it('rounds an off-grid deadline down', () => {
    const result = scheduleHeuristic(
      [task('a', { minutes: 120, deadline: at('2026-11-09T18:00') + 5 * 60_000 })],
      ctx,
    );
    expect(result.blocks.at(-1)?.end).toBe(at('2026-11-09T18:00'));
  });

  it('reports a task whose deadline already passed', () => {
    const result = scheduleHeuristic([task('a', { deadline: at('2026-11-09T05:00') })], ctx);
    expect(result.unscheduled).toEqual([
      { taskId: 'a', reason: 'DEADLINE_PASSED', missingMinutes: 60 },
    ]);
  });

  it('reports an unsplittable task longer than the max block', () => {
    const result = scheduleHeuristic([task('a', { minutes: 120, splittable: false })], ctx);
    expect(result.unscheduled).toEqual([
      { taskId: 'a', reason: 'TOO_LONG_FOR_BLOCK', missingMinutes: 120 },
    ]);
  });

  it('reports an unsplittable task larger than every free window', () => {
    const busy = context({
      rangeEnd: '2026-11-09',
      commitments: [{ id: 'c', daysOfWeek: [1], startTime: '08:00', endTime: '21:15' }],
    });
    const result = scheduleHeuristic(
      [task('a', { minutes: 75, splittable: false, deadline: at('2026-11-09T22:00') })],
      busy,
    );
    expect(result.blocks).toEqual([]);
    expect(result.unscheduled).toEqual([
      { taskId: 'a', reason: 'DEADLINE_IMPOSSIBLE', missingMinutes: 75 },
    ]);
  });

  it('fits a splittable task larger than any single window across windows', () => {
    const busy = context({
      rangeEnd: '2026-11-09',
      commitments: [{ id: 'c', daysOfWeek: [1], startTime: '08:00', endTime: '21:15' }],
    });
    const result = scheduleHeuristic(
      [task('a', { minutes: 105, deadline: at('2026-11-09T22:00') })],
      busy,
    );
    expect(show(result.blocks)).toEqual(['a 2026-11-09T07:00–08:00', 'a 2026-11-09T21:15–22:00']);
  });

  it('reports NO_FREE_TIME when the planned range is full but the deadline is later', () => {
    const fullDay = context({
      rangeEnd: '2026-11-09',
      commitments: [{ id: 'c', daysOfWeek: [1], startTime: '07:00', endTime: '22:00' }],
    });
    const result = scheduleHeuristic([task('a', { deadline: at('2026-11-20T18:00') })], fullDay);
    expect(result.unscheduled).toEqual([
      { taskId: 'a', reason: 'NO_FREE_TIME', missingMinutes: 60 },
    ]);
  });

  it('schedules what fits on a full day and reports the rest', () => {
    const oneDay = context({ rangeEnd: '2026-11-09', commitments: workWeek });
    const result = scheduleHeuristic(
      [
        task('a', { minutes: 240, deadline: at('2026-11-09T22:00'), priority: 'URGENT' }),
        task('b', { minutes: 120, deadline: at('2026-11-09T22:00') }),
      ],
      oneDay,
    );
    expect(result.blocks.every((b) => b.taskId === 'a')).toBe(true);
    expect(result.unscheduled).toEqual([
      { taskId: 'b', reason: 'DEADLINE_IMPOSSIBLE', missingMinutes: 30 },
    ]);
  });

  it('plans around locked blocks, keeping the break', () => {
    const locked = context({
      commitments: workWeek,
      fixedBlocks: [block('z', '2026-11-09T17:30', '2026-11-09T18:30')],
    });
    const result = scheduleHeuristic([task('a', { minutes: 90, splittable: false })], locked);
    expect(show(result.blocks)).toEqual(['a 2026-11-09T18:45–20:15']);
  });

  it('plans around blocks already accepted from the AI', () => {
    const result = scheduleHeuristic([task('a')], ctx, [
      block('ai', '2026-11-09T07:00', '2026-11-09T08:00'),
    ]);
    expect(show(result.blocks)).toEqual(['a 2026-11-09T17:00–18:00']);
  });

  it('starts from now, not from the beginning of the day', () => {
    const result = scheduleHeuristic([task('a')], context({ now: at('2026-11-09T09:10') }));
    expect(show(result.blocks)).toEqual(['a 2026-11-09T09:15–10:15']);
  });

  it('ignores tasks with nothing left to allocate', () => {
    expect(scheduleHeuristic([task('a', { minutes: 0 })], ctx)).toEqual({
      blocks: [],
      unscheduled: [],
    });
  });

  it('is deterministic', () => {
    const tasks = [
      task('a', { minutes: 180 }),
      task('b', { minutes: 45 }),
      task('c', { priority: 'HIGH' }),
    ];
    expect(scheduleHeuristic(tasks, ctx)).toEqual(scheduleHeuristic([...tasks].reverse(), ctx));
  });
});
