import { at, block, context, prefs, task, workWeek } from './fixtures';
import { validateAllocations } from './validator';

const ctx = context({ commitments: workWeek });
const codes = (result: ReturnType<typeof validateAllocations>) =>
  result.issues.map((issue) => issue.code);

describe('validateAllocations', () => {
  it('accepts a valid proposal', () => {
    const tasks = [task('a', { minutes: 150 }), task('b', { minutes: 45, splittable: false })];
    const result = validateAllocations(
      [
        block('a', '2026-11-09T17:00', '2026-11-09T18:30'),
        block('b', '2026-11-09T18:45', '2026-11-09T19:30'),
        block('a', '2026-11-10T17:00', '2026-11-10T18:00'),
      ],
      tasks,
      ctx,
    );
    expect(result.issues).toEqual([]);
    expect(result.rejectedTaskIds).toEqual([]);
    expect(result.acceptedTaskIds.sort()).toEqual(['a', 'b']);
    expect(result.accepted).toHaveLength(3);
  });

  it('adjusts blocks to the grid and returns them in chronological order', () => {
    const result = validateAllocations(
      [
        {
          taskId: 'a',
          start: at('2026-11-10T17:00') + 120_000,
          end: at('2026-11-10T17:30') - 60_000,
        },
        block('a', '2026-11-09T17:00', '2026-11-09T17:30'),
      ],
      [task('a', { minutes: 60 })],
      ctx,
    );
    expect(result.issues).toEqual([]);
    expect(result.accepted.map((b) => b.start)).toEqual([
      at('2026-11-09T17:00'),
      at('2026-11-10T17:00'),
    ]);
    expect(result.accepted[1]?.end).toBe(at('2026-11-10T17:30'));
  });

  it('rejects a block overlapping a fixed commitment', () => {
    const result = validateAllocations(
      [block('a', '2026-11-09T16:30', '2026-11-09T17:30')],
      [task('a')],
      ctx,
    );
    expect(codes(result)).toEqual(['OVERLAPS_COMMITMENT']);
    expect(result.accepted).toEqual([]);
    expect(result.issues[0]?.message).toContain(
      '"Tarefa a": o bloco 2026-11-09T16:30–17:30 sobrepõe um compromisso fixo.',
    );
  });

  it('rejects a block inside the protected lunch', () => {
    const result = validateAllocations(
      [block('a', '2026-11-14T11:30', '2026-11-14T12:30')],
      [task('a', { deadline: at('2026-11-15T22:00') })],
      ctx,
    );
    expect(codes(result)).toEqual(['OVERLAPS_LUNCH']);
  });

  it('rejects a block outside the daily window', () => {
    const result = validateAllocations(
      [block('a', '2026-11-10T06:00', '2026-11-10T07:00')],
      [task('a')],
      ctx,
    );
    expect(codes(result)).toEqual(['OUTSIDE_DAY_WINDOW']);
  });

  it('rejects a block ending after the task deadline', () => {
    const result = validateAllocations(
      [block('a', '2026-11-09T17:30', '2026-11-09T18:30')],
      [task('a', { deadline: at('2026-11-09T18:00') })],
      ctx,
    );
    expect(codes(result)).toEqual(['AFTER_DEADLINE']);
  });

  it('accepts a block ending exactly at the deadline', () => {
    const result = validateAllocations(
      [block('a', '2026-11-09T17:00', '2026-11-09T18:00')],
      [task('a', { deadline: at('2026-11-09T18:00') })],
      ctx,
    );
    expect(result.issues).toEqual([]);
  });

  it('rejects a block longer than the max focus block', () => {
    const result = validateAllocations(
      [block('a', '2026-11-09T17:00', '2026-11-09T19:00')],
      [task('a', { minutes: 120 })],
      ctx,
    );
    expect(codes(result)).toEqual(['EXCEEDS_MAX_BLOCK']);
  });

  it('rejects a total different from the estimate (too little and too much)', () => {
    const tasks = [task('a', { minutes: 120 }), task('b', { minutes: 30 })];
    const result = validateAllocations(
      [
        block('a', '2026-11-09T17:00', '2026-11-09T18:00'),
        block('b', '2026-11-09T18:15', '2026-11-09T19:15'),
      ],
      tasks,
      ctx,
    );
    expect(codes(result)).toEqual(['WRONG_TOTAL', 'WRONG_TOTAL']);
    expect(result.issues[0]?.message).toContain(
      'foram alocados 60 minutos, mas a tarefa precisa de exatamente 120',
    );
    expect(result.accepted).toEqual([]);
  });

  it('reports tasks the proposal left out', () => {
    const result = validateAllocations(
      [block('a', '2026-11-09T17:00', '2026-11-09T18:00')],
      [task('a'), task('b')],
      ctx,
    );
    expect(result.acceptedTaskIds).toEqual(['a']);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'MISSING', taskId: 'b' })]);
  });

  it('rejects an unsplittable task proposed in several blocks', () => {
    const result = validateAllocations(
      [
        block('a', '2026-11-09T17:00', '2026-11-09T17:30'),
        block('a', '2026-11-09T18:00', '2026-11-09T18:30'),
      ],
      [task('a', { splittable: false })],
      ctx,
    );
    expect(codes(result)).toEqual(['NOT_SPLITTABLE']);
  });

  it('rejects a crumb next to other blocks of the same task', () => {
    const result = validateAllocations(
      [
        block('a', '2026-11-09T17:00', '2026-11-09T18:30'),
        block('a', '2026-11-09T19:00', '2026-11-09T19:15'),
      ],
      [task('a', { minutes: 105 })],
      ctx,
    );
    expect(codes(result)).toEqual(['FRAGMENTED']);
    expect(result.issues[0]?.message).toContain('menos de 30 minutos');
  });

  it('accepts a 15 minute block when it is the whole task', () => {
    const result = validateAllocations(
      [block('a', '2026-11-09T17:00', '2026-11-09T17:15')],
      [task('a', { minutes: 15, splittable: false })],
      ctx,
    );
    expect(result.issues).toEqual([]);
  });

  it('rejects blocks of unknown tasks without affecting valid ones', () => {
    const result = validateAllocations(
      [
        block('ghost', '2026-11-09T19:00', '2026-11-09T20:00'),
        block('a', '2026-11-09T17:00', '2026-11-09T18:00'),
      ],
      [task('a')],
      ctx,
    );
    expect(codes(result)).toEqual(['UNKNOWN_TASK']);
    expect(result.acceptedTaskIds).toEqual(['a']);
  });

  it('rejects the later of two overlapping proposed blocks', () => {
    const result = validateAllocations(
      [
        block('a', '2026-11-09T17:00', '2026-11-09T18:00'),
        block('b', '2026-11-09T17:30', '2026-11-09T18:30'),
      ],
      [task('a'), task('b')],
      ctx,
    );
    expect(codes(result)).toEqual(['OVERLAPS_PROPOSED']);
    expect(result.acceptedTaskIds).toEqual(['a']);
    expect(result.rejectedTaskIds).toEqual(['b']);
  });

  it('enforces the minimum break between proposed blocks', () => {
    const result = validateAllocations(
      [
        block('a', '2026-11-09T17:00', '2026-11-09T18:00'),
        block('b', '2026-11-09T18:00', '2026-11-09T19:00'),
      ],
      [task('a'), task('b')],
      ctx,
    );
    expect(codes(result)).toEqual(['BREAK_TOO_SHORT']);
    expect(result.issues[0]?.message).toContain('intervalo mínimo de 15 minutos');
  });

  it('allows back-to-back blocks when no break is required', () => {
    const result = validateAllocations(
      [
        block('a', '2026-11-09T17:00', '2026-11-09T18:00'),
        block('b', '2026-11-09T18:00', '2026-11-09T19:00'),
      ],
      [task('a'), task('b')],
      context({ commitments: workWeek, prefs: { ...prefs, minBreakMinutes: 0 } }),
    );
    expect(result.issues).toEqual([]);
  });

  it('does not let a task dodge the max block by chaining its own blocks', () => {
    const result = validateAllocations(
      [
        block('a', '2026-11-09T17:00', '2026-11-09T18:30'),
        block('a', '2026-11-09T18:30', '2026-11-09T19:30'),
      ],
      [task('a', { minutes: 150 })],
      ctx,
    );
    expect(codes(result)).toEqual(['BREAK_TOO_SHORT']);
    expect(result.accepted).toEqual([]);
  });

  it('respects locked blocks: no overlap and no squeezing next to them', () => {
    const locked = context({
      commitments: workWeek,
      fixedBlocks: [block('z', '2026-11-09T18:00', '2026-11-09T19:00')],
    });
    const overlapping = validateAllocations(
      [block('a', '2026-11-09T18:30', '2026-11-09T19:30')],
      [task('a')],
      locked,
    );
    expect(codes(overlapping)).toEqual(['OVERLAPS_BLOCK']);
    const tooClose = validateAllocations(
      [block('a', '2026-11-09T19:00', '2026-11-09T20:00')],
      [task('a')],
      locked,
    );
    expect(codes(tooClose)).toEqual(['BREAK_TOO_SHORT']);
    const before = validateAllocations(
      [block('a', '2026-11-09T17:00', '2026-11-09T18:00')],
      [task('a')],
      locked,
    );
    expect(codes(before)).toEqual(['BREAK_TOO_SHORT']);
    const fine = validateAllocations(
      [block('a', '2026-11-09T19:15', '2026-11-09T20:15')],
      [task('a')],
      locked,
    );
    expect(fine.issues).toEqual([]);
  });

  it('rejects blocks in the past or outside the planned range', () => {
    const past = validateAllocations(
      [block('a', '2026-11-09T07:00', '2026-11-09T08:00')],
      [task('a')],
      context({ now: at('2026-11-09T07:30') }),
    );
    expect(codes(past)).toEqual(['IN_THE_PAST']);
    const outside = validateAllocations(
      [block('a', '2026-11-16T07:00', '2026-11-16T08:00')],
      [task('a', { deadline: at('2026-11-20T18:00') })],
      ctx,
    );
    expect(codes(outside)).toEqual(['OUTSIDE_RANGE']);
  });

  it('rejects inverted and multi-day blocks', () => {
    const inverted = validateAllocations(
      [block('a', '2026-11-09T18:00', '2026-11-09T17:00')],
      [task('a')],
      ctx,
    );
    expect(codes(inverted)).toEqual(['INVALID_RANGE']);
    const multiDay = validateAllocations(
      [block('a', '2026-11-09T21:30', '2026-11-10T07:30')],
      [task('a', { minutes: 600 })],
      ctx,
    );
    expect(codes(multiDay)).toEqual(expect.arrayContaining(['CROSSES_DAYS', 'EXCEEDS_MAX_BLOCK']));
  });

  it('rejects the whole task when any of its blocks is invalid', () => {
    const result = validateAllocations(
      [
        block('a', '2026-11-09T17:00', '2026-11-09T18:00'),
        block('a', '2026-11-10T09:00', '2026-11-10T10:00'),
      ],
      [task('a', { minutes: 120 })],
      ctx,
    );
    expect(result.rejectedTaskIds).toEqual(['a']);
    expect(result.accepted).toEqual([]);
  });

  it('frees the slot of a rejected task for the blocks that follow', () => {
    // b is invalid (wrong total), so c right after it must not be blamed for the break.
    const result = validateAllocations(
      [
        block('b', '2026-11-09T17:00', '2026-11-09T18:00'),
        block('c', '2026-11-09T18:00', '2026-11-09T19:00'),
      ],
      [task('b', { minutes: 30 }), task('c')],
      ctx,
    );
    expect(result.acceptedTaskIds).toEqual(['c']);
  });

  it('accepts an empty proposal when there is nothing to plan', () => {
    expect(validateAllocations([], [], ctx)).toEqual({
      accepted: [],
      acceptedTaskIds: [],
      rejectedTaskIds: [],
      issues: [],
    });
  });
});
