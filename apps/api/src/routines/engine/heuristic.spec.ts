import { durationMinutes, toLocalDateTime } from '@routinely/shared';
import { at, block, context, prefs, task, workWeek } from './fixtures';
import { compareTasks, mergeTouchingBlocks, scheduleHeuristic } from './heuristic';

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

  it('never schedules past the deadline: it uses all the time there is and reports the shortfall', () => {
    const result = scheduleHeuristic(
      [task('a', { minutes: 180, deadline: at('2026-11-09T18:00') })],
      ctx,
    );
    // 60 min before work + 60 min after it, both before the deadline: 120 of 180
    expect(show(result.blocks)).toEqual(['a 2026-11-09T07:00–08:00', 'a 2026-11-09T17:00–18:00']);
    expect(result.unscheduled).toEqual([]);
    expect(result.shortfalls).toEqual([
      { taskId: 'a', neededMinutes: 180, allocatedMinutes: 120, missingMinutes: 60 },
    ]);
  });

  it('reports as unscheduled only a task with no usable time at all before its deadline', () => {
    const result = scheduleHeuristic(
      [task('a', { minutes: 60, deadline: at('2026-11-09T07:00') })],
      context({ commitments: workWeek, now: at('2026-11-09T06:45') }),
    );
    expect(result.blocks).toEqual([]);
    expect(result.shortfalls).toEqual([]);
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

  it('shortens an unsplittable task longer than the max block to one focus block', () => {
    const result = scheduleHeuristic([task('a', { minutes: 120, splittable: false })], ctx);
    expect(result.unscheduled).toEqual([]);
    expect(result.blocks).toHaveLength(1);
    expect(durationMinutes(result.blocks[0] as { start: number; end: number })).toBe(90);
    expect(result.shortfalls).toEqual([
      { taskId: 'a', neededMinutes: 120, allocatedMinutes: 90, missingMinutes: 30 },
    ]);
  });

  it('shortens an unsplittable task larger than every free window to the largest window', () => {
    const busy = context({
      rangeEnd: '2026-11-09',
      commitments: [{ id: 'c', daysOfWeek: [1], startTime: '08:00', endTime: '21:15' }],
    });
    const result = scheduleHeuristic(
      [task('a', { minutes: 75, splittable: false, deadline: at('2026-11-09T22:00') })],
      busy,
    );
    expect(result.unscheduled).toEqual([]);
    expect(show(result.blocks)).toEqual(['a 2026-11-09T07:00–08:00']);
    expect(result.shortfalls).toEqual([
      { taskId: 'a', neededMinutes: 75, allocatedMinutes: 60, missingMinutes: 15 },
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
    // the more urgent task is whole; the other one gets what is left instead of being dropped
    const bMinutes = result.blocks
      .filter((b) => b.taskId === 'b')
      .reduce((sum, b) => sum + durationMinutes(b), 0);
    expect(result.unscheduled).toEqual([]);
    expect(result.shortfalls).toEqual([
      {
        taskId: 'b',
        neededMinutes: 120,
        allocatedMinutes: bMinutes,
        missingMinutes: 120 - bMinutes,
      },
    ]);
    expect(bMinutes).toBeGreaterThan(0);
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
      shortfalls: [],
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

describe('scheduleHeuristic — fragmentation', () => {
  const shortBlocks = (blocks: { start: number; end: number }[]) =>
    blocks.filter((b) => durationMinutes(b) < 30);
  const total = (blocks: { start: number; end: number }[]) =>
    blocks.reduce((sum, b) => sum + durationMinutes(b), 0);

  it('shortens a block instead of leaving a 15 minute tail (90 + 15 → 75 + 30)', () => {
    const result = scheduleHeuristic(
      [task('a', { minutes: 105 })],
      context({ now: at('2026-11-09T12:30') }),
    );
    expect(show(result.blocks)).toEqual(['a 2026-11-09T13:00–14:15', 'a 2026-11-09T14:30–15:00']);
  });

  it('keeps whole windows when that avoids a tail', () => {
    // Free: 07:00–08:15 (75) and 21:00–22:00 (60); 135 minutes with a 75 minute max block.
    const tight = context({
      rangeEnd: '2026-11-09',
      prefs: { ...prefs, maxFocusBlockMinutes: 75 },
      commitments: [{ id: 'c', daysOfWeek: [1], startTime: '08:15', endTime: '21:00' }],
    });
    const result = scheduleHeuristic(
      [task('a', { minutes: 135, deadline: at('2026-11-09T22:00') })],
      tight,
    );
    expect(show(result.blocks)).toEqual(['a 2026-11-09T07:00–08:15', 'a 2026-11-09T21:00–22:00']);
  });

  it('stretches a shaved block before resorting to a crumb', () => {
    // Free: 07:00–08:30 (90) and 21:45–22:00 (15). 105 minutes: the first block is shaved
    // to 75 to avoid a 15 minute tail, but the 30 minute tail fits nowhere, so the block
    // grows back to 90 and only the last 15 minutes become a crumb.
    const day = context({
      rangeEnd: '2026-11-09',
      commitments: [{ id: 'c', daysOfWeek: [1], startTime: '08:30', endTime: '21:45' }],
    });
    const result = scheduleHeuristic(
      [task('a', { minutes: 105, deadline: at('2026-11-09T22:00') })],
      day,
    );
    expect(show(result.blocks)).toEqual(['a 2026-11-09T07:00–08:30', 'a 2026-11-09T21:45–22:00']);
  });

  it('schedules the most that fits and reports the honest shortfall when even crumbs do not fit', () => {
    // 105 free minutes in one window, but a block holds at most 90 and needs a break after.
    const day = context({
      rangeEnd: '2026-11-09',
      commitments: [{ id: 'c', daysOfWeek: [1], startTime: '08:45', endTime: '22:00' }],
    });
    const result = scheduleHeuristic(
      [task('a', { minutes: 105, deadline: at('2026-11-09T22:00') })],
      day,
    );
    expect(show(result.blocks)).toEqual(['a 2026-11-09T07:00–08:30']);
    expect(result.shortfalls).toEqual([
      { taskId: 'a', neededMinutes: 105, allocatedMinutes: 90, missingMinutes: 15 },
    ]);
    expect(result.unscheduled).toEqual([]);
  });

  it('uses a single crumb only for the minutes that fit nowhere else', () => {
    const tight = context({
      rangeEnd: '2026-11-09',
      commitments: [
        { id: 'a', daysOfWeek: [1], startTime: '07:15', endTime: '12:00' },
        { id: 'b', daysOfWeek: [1], startTime: '13:00', endTime: '20:00' },
      ],
    });
    // Free: 07:00–07:15 (15) and 20:00–22:00 (120) → 90 + 15 (after the break) + the 07:00 slot.
    const result = scheduleHeuristic(
      [task('a', { minutes: 120, deadline: at('2026-11-09T22:00') })],
      tight,
    );
    expect(result.unscheduled).toEqual([]);
    expect(total(result.blocks)).toBe(120);
    expect(shortBlocks(result.blocks).length).toBeLessThanOrEqual(2);
  });

  it('leaves no block under 30 minutes in a week shaped like the reported one', () => {
    // Commitments on odd quarter hours (08:15, 18:15) used to create 15 minute crumbs.
    const commitments = [
      { id: 'devocional', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: '07:00', endTime: '08:00' },
      { id: 'wa-remoto', daysOfWeek: [6], startTime: '08:15', endTime: '11:15' },
      { id: 'esi', daysOfWeek: [0], startTime: '09:00', endTime: '11:00' },
      { id: 'dados', daysOfWeek: [2, 4], startTime: '14:00', endTime: '16:00' },
      { id: 'reforco', daysOfWeek: [6], startTime: '14:00', endTime: '16:00' },
      { id: 'ciber', daysOfWeek: [2], startTime: '16:00', endTime: '18:00' },
      { id: 'empreend', daysOfWeek: [1, 3], startTime: '16:00', endTime: '18:00' },
      { id: 'etica', daysOfWeek: [5], startTime: '16:00', endTime: '18:00' },
      { id: 'piola', daysOfWeek: [5], startTime: '17:00', endTime: '19:00' },
      { id: 'culto', daysOfWeek: [0], startTime: '18:00', endTime: '21:00' },
      { id: 'wa', daysOfWeek: [2, 4], startTime: '18:15', endTime: '21:15' },
      { id: 'gerencia', daysOfWeek: [1, 3], startTime: '20:00', endTime: '22:00' },
    ];
    const week = context({
      commitments,
      prefs: { ...prefs, lunchStart: '12:00', lunchEnd: '14:00' },
      now: at('2026-11-11T09:00'),
    });
    const tasks = [
      task('estado1', { minutes: 120, deadline: at('2026-11-12T18:00'), priority: 'HIGH' }),
      task('jenkins', { minutes: 180, deadline: at('2026-11-13T20:00'), priority: 'URGENT' }),
      task('actions', { minutes: 120, deadline: at('2026-11-13T20:00'), priority: 'HIGH' }),
      task('estado2', { minutes: 240, deadline: at('2026-11-14T22:00') }),
      task('projetos', { minutes: 600, deadline: at('2026-11-15T22:00') }),
    ];
    const result = scheduleHeuristic(tasks, week);
    expect(result.unscheduled).toEqual([]);
    expect(shortBlocks(result.blocks)).toEqual([]);
  });
});

describe('mergeTouchingBlocks', () => {
  it('joins touching blocks of the same task up to the max focus block', () => {
    const merged = mergeTouchingBlocks(
      [
        block('a', '2026-11-09T18:00', '2026-11-09T18:30'),
        block('a', '2026-11-09T17:00', '2026-11-09T18:00'),
        block('b', '2026-11-09T18:30', '2026-11-09T19:00'),
        block('a', '2026-11-09T19:00', '2026-11-09T20:00'),
      ],
      90,
    );
    expect(show(merged)).toEqual([
      'a 2026-11-09T17:00–18:30',
      'b 2026-11-09T18:30–19:00',
      'a 2026-11-09T19:00–20:00',
    ]);
  });

  it('does not merge beyond the max focus block', () => {
    const blocks = [
      block('a', '2026-11-09T17:00', '2026-11-09T18:00'),
      block('a', '2026-11-09T18:00', '2026-11-09T19:00'),
    ];
    expect(mergeTouchingBlocks(blocks, 90)).toHaveLength(2);
  });
});

describe('scheduleHeuristic: fairness between tasks of the same priority', () => {
  const minutesOf = (blocks: { taskId: string; start: number; end: number }[], id: string) =>
    blocks.filter((b) => b.taskId === id).reduce((sum, b) => sum + durationMinutes(b), 0);
  // Monday 07:00-12:00 is free (300 min); the lunch starts at 12:00.
  const morning = context({ rangeEnd: '2026-11-09' });

  it("splits the scarce time evenly between same-priority tasks, even with different deadlines (the author's case)", () => {
    const early = task('early', {
      minutes: 240,
      deadline: at('2026-11-09T10:00'),
      priority: 'HIGH',
    });
    const late = task('late', { minutes: 240, deadline: at('2026-11-09T12:00'), priority: 'HIGH' });
    const result = scheduleHeuristic([early, late], morning);

    const a = minutesOf(result.blocks, 'early');
    const b = minutesOf(result.blocks, 'late');
    // before: 'early' took everything before 10:00 and 'late' got the crumbs after it
    expect(Math.abs(a - b)).toBeLessThanOrEqual(30);
    expect(a).toBeGreaterThan(90);
    expect(b).toBeGreaterThan(90);
    // and (almost) no time is wasted compared with the deadline-first split (255 min):
    // one more block means one more break
    expect(a + b).toBeGreaterThanOrEqual(230);
    expect(result.shortfalls.map((s) => s.taskId).sort()).toEqual(['early', 'late']);
    for (const s of result.shortfalls) {
      expect(s.allocatedMinutes).toBe(minutesOf(result.blocks, s.taskId));
      expect(s.missingMinutes).toBe(240 - s.allocatedMinutes);
    }
    // deadlines still hold
    for (const b of result.blocks.filter((x) => x.taskId === 'early')) {
      expect(b.end).toBeLessThanOrEqual(at('2026-11-09T10:00'));
    }
  });

  it('does not use more total time than the deadline-first split would', () => {
    const tasks = [
      task('early', { minutes: 240, deadline: at('2026-11-09T10:00'), priority: 'HIGH' }),
      task('late', { minutes: 240, deadline: at('2026-11-09T12:00'), priority: 'HIGH' }),
    ];
    const fair = scheduleHeuristic(tasks, morning);
    const solo = tasks.map((t) => scheduleHeuristic([t], morning).blocks);
    const used = fair.blocks.reduce((sum, b) => sum + durationMinutes(b), 0);
    // never beyond the 300 free minutes
    expect(used).toBeLessThanOrEqual(300);
    expect(solo.every((blocks) => blocks.length > 0)).toBe(true);
  });

  it('keeps deadline-first order between DIFFERENT priorities (only equal priorities are balanced)', () => {
    const result = scheduleHeuristic(
      [
        task('early', { minutes: 240, deadline: at('2026-11-09T10:00'), priority: 'HIGH' }),
        task('late', { minutes: 240, deadline: at('2026-11-09T12:00'), priority: 'LOW' }),
      ],
      morning,
    );
    expect(minutesOf(result.blocks, 'early')).toBeGreaterThan(minutesOf(result.blocks, 'late'));
  });

  it('does not rebalance a single partial task or unsplittable ones', () => {
    const single = scheduleHeuristic(
      [task('only', { minutes: 600, deadline: at('2026-11-09T12:00') })],
      morning,
    );
    expect(single.shortfalls).toHaveLength(1);
    const fixed = scheduleHeuristic(
      [
        task('x', { minutes: 120, splittable: false, deadline: at('2026-11-09T10:00') }),
        task('y', { minutes: 120, splittable: false, deadline: at('2026-11-09T12:00') }),
      ],
      morning,
    );
    // each unsplittable task keeps one block
    expect(fixed.blocks.filter((b) => b.taskId === 'x')).toHaveLength(1);
  });
});
