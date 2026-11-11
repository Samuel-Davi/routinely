import { DEFAULT_PREFERENCES } from '@routinely/shared';
import { at } from './engine/fixtures';
import {
  resolveRange,
  selectCarriedBlocks,
  toEngineTasks,
  type ExistingBlock,
  type PlannableTask,
} from './planning-input';

const timezone = 'America/Manaus';
const date = (local: string) => new Date(at(local));

function existing(
  taskId: string,
  start: string,
  end: string,
  extra: Partial<ExistingBlock> = {},
): ExistingBlock {
  return {
    taskId,
    start: date(start),
    end: date(end),
    locked: false,
    completedAt: null,
    rationale: null,
    ...extra,
  };
}

describe('resolveRange', () => {
  it('covers Monday to Sunday of the anchor week', () => {
    expect(
      resolveRange('2026-11-11', { untilLastDeadline: false, deadlines: [], timezone }),
    ).toEqual({
      rangeStart: '2026-11-09',
      rangeEnd: '2026-11-15',
    });
  });

  it('extends to the week of the latest deadline', () => {
    const range = resolveRange('2026-11-09', {
      untilLastDeadline: true,
      deadlines: [date('2026-11-12T18:00'), date('2026-11-24T18:00')],
      timezone,
    });
    expect(range).toEqual({ rangeStart: '2026-11-09', rangeEnd: '2026-11-29' });
  });

  it('never plans more than four weeks', () => {
    const range = resolveRange('2026-11-09', {
      untilLastDeadline: true,
      deadlines: [date('2027-03-01T18:00')],
      timezone,
    });
    expect(range.rangeEnd).toBe('2026-12-06');
  });

  it('keeps the single week when deadlines are earlier or absent', () => {
    const base = { rangeStart: '2026-11-09', rangeEnd: '2026-11-15' };
    expect(
      resolveRange('2026-11-09', { untilLastDeadline: true, deadlines: [], timezone }),
    ).toEqual(base);
    expect(
      resolveRange('2026-11-09', {
        untilLastDeadline: true,
        deadlines: [date('2026-11-01T10:00')],
        timezone,
      }),
    ).toEqual(base);
    expect(
      resolveRange('2026-11-09', {
        untilLastDeadline: false,
        deadlines: [date('2026-11-24T18:00')],
        timezone,
      }),
    ).toEqual(base);
  });
});

describe('selectCarriedBlocks', () => {
  const options = {
    openTaskIds: new Set(['a', 'b']),
    now: at('2026-11-10T12:00'),
    range: { rangeStart: '2026-11-09', rangeEnd: '2026-11-15' },
    prefs: DEFAULT_PREFERENCES,
  };
  const pick = (blocks: ExistingBlock[]) =>
    selectCarriedBlocks(blocks, options).map((b) => b.rationale);
  const named = (name: string, ...args: Parameters<typeof existing>) => ({
    ...existing(...args),
    rationale: name,
  });

  it('applies the carry-over rules', () => {
    const kept = pick([
      named('completed-past', 'a', '2026-11-09T17:00', '2026-11-09T18:00', {
        completedAt: date('2026-11-09T18:00'),
      }),
      named('completed-of-done-task', 'gone', '2026-11-09T19:00', '2026-11-09T20:00', {
        completedAt: date('2026-11-09T20:00'),
      }),
      named('overdue', 'a', '2026-11-10T07:00', '2026-11-10T08:00'),
      named('overdue-locked', 'a', '2026-11-10T09:00', '2026-11-10T10:00', { locked: true }),
      named('in-progress', 'b', '2026-11-10T11:30', '2026-11-10T12:30'),
      named('future-locked', 'a', '2026-11-11T17:00', '2026-11-11T18:00', { locked: true }),
      named('future-unlocked', 'a', '2026-11-12T17:00', '2026-11-12T18:00'),
      named('future-of-done-task', 'gone', '2026-11-12T19:00', '2026-11-12T20:00', {
        locked: true,
      }),
      named('next-week', 'b', '2026-11-17T17:00', '2026-11-17T18:00'),
      named('previous-week', 'b', '2026-11-08T21:00', '2026-11-08T22:00'),
    ]);
    expect(kept).toEqual([
      'completed-past',
      'completed-of-done-task',
      'in-progress',
      'future-locked',
      'next-week',
    ]);
  });

  it('keeps future blocks before the planned range', () => {
    const laterRange = { ...options, range: { rangeStart: '2026-11-16', rangeEnd: '2026-11-22' } };
    const kept = selectCarriedBlocks(
      [existing('a', '2026-11-12T17:00', '2026-11-12T18:00')],
      laterRange,
    );
    expect(kept).toHaveLength(1);
  });
});

describe('toEngineTasks', () => {
  const plannable = (id: string, extra: Partial<PlannableTask> = {}): PlannableTask => ({
    id,
    title: id,
    priority: 'MEDIUM',
    deadline: date('2026-11-13T18:00'),
    complexity: 4,
    estimatedMinutes: 120,
    splittable: false,
    ...extra,
  });

  it('subtracts the minutes already covered by carried blocks', () => {
    const tasks = toEngineTasks(
      [plannable('a'), plannable('b'), plannable('c', { estimatedMinutes: 30 })],
      [
        existing('a', '2026-11-09T17:00', '2026-11-09T18:00'),
        existing('a', '2026-11-10T17:00', '2026-11-10T17:30'),
        existing('c', '2026-11-09T19:00', '2026-11-09T20:00'),
      ],
    );
    expect(tasks.map((t) => [t.id, t.minutes])).toEqual([
      ['a', 30],
      ['b', 120],
      ['c', 0],
    ]);
    expect(tasks[0]).toMatchObject({
      deadline: at('2026-11-13T18:00'),
      complexity: 4,
      splittable: false,
    });
  });

  it('skips tasks without an estimate and fills safe defaults', () => {
    const tasks = toEngineTasks(
      [
        plannable('a', { estimatedMinutes: null }),
        plannable('b', { complexity: null, splittable: null }),
      ],
      [],
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: 'b', complexity: 3, splittable: true });
  });
});
