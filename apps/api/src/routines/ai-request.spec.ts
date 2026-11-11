import { RoutineProposer } from '../ai/generate-routine';
import { buildPlanningInput, buildProposeFn } from './ai-request';
import { at, context, task, workWeek } from './engine/fixtures';

const ctx = context({ commitments: workWeek });
const tasks = [task('a', { minutes: 120 }), task('b', { minutes: 60 })];

describe('buildPlanningInput', () => {
  it('is compact: local times, linked commitment, no ids of blocks and the instruction', () => {
    const build = buildPlanningInput(
      {
        ...ctx,
        fixedBlocks: [{ taskId: 'a', start: at('2026-11-10T17:00'), end: at('2026-11-10T18:00') }],
      },
      new Map([['a', 'Tarefa A']]),
      new Map([['a', 'Web Academy']]),
      'sem trabalho no domingo',
    );
    const input = build(tasks);
    expect(input.now).toBe('2026-11-09T06:00');
    expect(input.tasks[0]).toMatchObject({ id: 'a', commitment: 'Web Academy', minutes: 120 });
    expect(input.tasks[1]?.commitment).toBeUndefined();
    expect(input.lockedBlocks).toEqual([
      { title: 'Tarefa A', start: '2026-11-10T17:00', end: '2026-11-10T18:00' },
    ]);
    expect(input.instruction).toBe('sem trabalho no domingo');
    expect(input.freeWindows[0]).toEqual({ start: '2026-11-09T07:00', end: '2026-11-09T08:00' });
  });
});

describe('buildProposeFn', () => {
  const build = buildPlanningInput(ctx, new Map(), new Map());

  it('times: converts the local times the model returned into instants', async () => {
    const proposer = {
      propose: jest
        .fn()
        .mockResolvedValue([
          { taskId: 'a', start: '2026-11-09T07:00', end: '2026-11-09T08:00', rationale: '' },
        ]),
      proposeOrder: jest.fn(),
    } as unknown as RoutineProposer;
    const blocks = await buildProposeFn(
      'times',
      proposer,
      ctx,
      build,
    )({
      tasks,
      tier: 'default',
    });
    expect(blocks).toEqual([
      { taskId: 'a', start: at('2026-11-09T07:00'), end: at('2026-11-09T08:00'), rationale: null },
    ]);
  });

  it('order and order-day: the backend picks the times, in the model order', async () => {
    const proposeOrder = jest.fn().mockResolvedValue([
      { taskId: 'b', blocks: [{ minutes: 60 }], rationale: 'primeiro' },
      { taskId: 'a', blocks: [{ minutes: 90 }, { minutes: 30 }], rationale: 'depois' },
    ]);
    const proposer = { propose: jest.fn(), proposeOrder } as unknown as RoutineProposer;
    const blocks = await buildProposeFn(
      'order',
      proposer,
      ctx,
      build,
    )({
      tasks,
      tier: 'retry',
      feedback: ['x'],
    });
    expect(proposeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'retry', feedback: ['x'] }),
      false,
    );
    expect(blocks[0]).toMatchObject({ taskId: 'b', start: at('2026-11-09T07:00') });
    expect(blocks.filter((b) => b.taskId === 'a')).toHaveLength(2);

    await buildProposeFn('order-day', proposer, ctx, build)({ tasks, tier: 'default' });
    expect(proposeOrder).toHaveBeenLastCalledWith(expect.anything(), true);
  });
});
