import { MINUTE_MS } from '@routinely/shared';
import { at, context, task, workWeek } from './fixtures';
import { placeByOrder } from './place-order';
import { validateAllocations } from './validator';

const ctx = context({ commitments: workWeek });
const minutes = (b: { start: number; end: number }) => (b.end - b.start) / MINUTE_MS;

describe('placeByOrder', () => {
  it('places items in the model order, each in the earliest window that holds it', () => {
    const tasks = [task('a', { minutes: 60 }), task('b', { minutes: 60 })];
    const blocks = placeByOrder(
      [
        { taskId: 'b', blocks: [{ minutes: 60 }], rationale: 'primeiro' },
        { taskId: 'a', blocks: [{ minutes: 60 }] },
      ],
      tasks,
      ctx,
    );
    // Monday 07:00–08:00 is free before work; b is first in the AI order, so it gets it.
    expect(blocks.map((b) => [b.taskId, b.start])).toEqual([
      ['b', at('2026-11-09T07:00')],
      ['a', at('2026-11-09T17:00')],
    ]);
    expect(blocks[0]?.rationale).toBe('primeiro');
    expect(blocks[1]?.rationale).toBeNull();
  });

  it('honours the preferred day, falling back to the first window when it does not fit', () => {
    const tasks = [task('a', { minutes: 60 }), task('b', { minutes: 60 })];
    const blocks = placeByOrder(
      [
        { taskId: 'a', blocks: [{ minutes: 60, day: '2026-11-11' }] },
        // The 12th is a Thursday: the day has free time, but no window can hold 24h.
        { taskId: 'b', blocks: [{ minutes: 60, day: '2030-01-01' }] },
      ],
      tasks,
      ctx,
    );
    expect(blocks[0]?.taskId).toBe('b');
    expect(blocks[0]?.start).toBe(at('2026-11-09T07:00'));
    expect(blocks[1]).toMatchObject({ taskId: 'a', start: at('2026-11-11T07:00') });
  });

  it('snaps sizes to the grid, clamps to the focus block and forces the exact total', () => {
    const tasks = [task('a', { minutes: 150 })];
    // 100 → clamped to 90; 10 → raised to 15; the rest (45) is completed by backend.
    const blocks = placeByOrder(
      [{ taskId: 'a', blocks: [{ minutes: 100 }, { minutes: 10 }] }],
      tasks,
      ctx,
    );
    expect(blocks.reduce((sum, b) => sum + minutes(b), 0)).toBe(150);
    expect(Math.max(...blocks.map(minutes))).toBeLessThanOrEqual(90);
  });

  it('cuts blocks beyond the total and keeps unsplittable tasks in one piece', () => {
    const tasks = [task('a', { minutes: 30 }), task('b', { minutes: 60, splittable: false })];
    const blocks = placeByOrder(
      [
        { taskId: 'a', blocks: [{ minutes: 30 }, { minutes: 30 }] },
        { taskId: 'b', blocks: [{ minutes: 15 }, { minutes: 45 }] },
      ],
      tasks,
      ctx,
    );
    expect(blocks.filter((b) => b.taskId === 'a').map(minutes)).toEqual([30]);
    expect(blocks.filter((b) => b.taskId === 'b').map(minutes)).toEqual([60]);
  });

  it('ignores unknown and repeated tasks and leaves out what does not fit', () => {
    const tasks = [task('a', { minutes: 60, deadline: at('2026-11-09T07:30') })];
    expect(
      placeByOrder(
        [
          { taskId: 'ghost', blocks: [{ minutes: 60 }] },
          { taskId: 'a', blocks: [{ minutes: 60 }] },
        ],
        tasks,
        ctx,
      ),
    ).toEqual([]);

    const ok = [task('a', { minutes: 60 })];
    const twice = placeByOrder(
      [
        { taskId: 'a', blocks: [{ minutes: 60 }] },
        { taskId: 'a', blocks: [{ minutes: 60 }] },
      ],
      ok,
      ctx,
    );
    expect(twice).toHaveLength(1);
  });

  it('produces blocks the validator accepts', () => {
    const tasks = [task('a', { minutes: 240 }), task('b', { minutes: 120 })];
    const blocks = placeByOrder(
      [
        { taskId: 'a', blocks: [{ minutes: 90 }, { minutes: 90 }, { minutes: 60 }] },
        { taskId: 'b', blocks: [{ minutes: 60 }, { minutes: 60 }] },
      ],
      tasks,
      ctx,
    );
    const result = validateAllocations(blocks, tasks, ctx);
    expect(result.issues).toEqual([]);
    expect(result.acceptedTaskIds.sort()).toEqual(['a', 'b']);
  });
});
