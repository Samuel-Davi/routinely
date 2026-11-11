import {
  MINUTE_MS,
  PRIORITIES,
  dayWindow,
  durationMinutes,
  expandCommitments,
  lunchInterval,
  overlaps,
  utcToZonedParts,
  type SchedulingCommitment,
} from '@routinely/shared';
import { at, block, context, prefs, task, workWeek } from './fixtures';
import {
  INVALID_PROPOSAL_NOTICE,
  NOT_CONFIGURED_NOTICE,
  REPAIRED_NOTICE,
  planRoutine,
  type ProposalRequest,
  type ProposeFn,
} from './plan';
import type { EngineBlock, EngineTask, PlanResult, PlanningContext } from './types';

const ctx = context({ commitments: workWeek });
const llmError = (kind: string) => Object.assign(new Error(kind), { kind });

/** Scripted AI: each call returns (or throws) the next entry. */
function scripted(...replies: (EngineBlock[] | Error)[]) {
  const requests: ProposalRequest[] = [];
  const propose: ProposeFn = async (request) => {
    requests.push(request);
    const reply = replies.shift();
    if (!reply) throw new Error('no reply scripted');
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { propose, requests };
}

describe('planRoutine', () => {
  const tasks = [task('a', { minutes: 90 }), task('b', { minutes: 60 })];
  const validProposal = [
    block('a', '2026-11-09T17:00', '2026-11-09T18:30'),
    block('b', '2026-11-09T19:00', '2026-11-09T20:00'),
  ];

  it('uses only the heuristic when no AI is configured', async () => {
    const result = await planRoutine({ tasks, context: ctx });
    expect(result.source).toBe('HEURISTIC');
    expect(result.notice).toBe(NOT_CONFIGURED_NOTICE);
    expect(result.blocks).toHaveLength(2);
    expect(result.unscheduled).toEqual([]);
  });

  it('keeps a valid AI proposal untouched', async () => {
    const { propose, requests } = scripted(validProposal);
    const result = await planRoutine({ tasks, context: ctx, propose });
    expect(result).toMatchObject({ source: 'AI', notice: null, unscheduled: [] });
    expect(result.blocks).toEqual(validProposal);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ tier: 'default' });
    expect(requests[0]?.feedback).toBeUndefined();
  });

  it('retries once with the validator feedback and accepts the corrected proposal', async () => {
    const overlapping = [
      block('a', '2026-11-09T16:00', '2026-11-09T17:30'),
      validProposal[1] as EngineBlock,
    ];
    const { propose, requests } = scripted(overlapping, validProposal);
    const result = await planRoutine({ tasks, context: ctx, propose });
    expect(result.source).toBe('AI');
    expect(result.blocks).toEqual(validProposal);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.tier).toBe('retry');
    expect(requests[1]?.feedback?.[0]).toContain('sobrepõe um compromisso fixo');
  });

  it('repairs a partially invalid proposal with the heuristic after the retry fails too', async () => {
    const partlyWrong = [
      block('a', '2026-11-09T16:00', '2026-11-09T17:30'),
      validProposal[1] as EngineBlock,
    ];
    const { propose, requests } = scripted(partlyWrong, partlyWrong);
    const result = await planRoutine({ tasks, context: ctx, propose });
    expect(requests).toHaveLength(2);
    expect(result.source).toBe('AI_REPAIRED');
    expect(result.notice).toBe(REPAIRED_NOTICE);
    expect(result.blocks).toContainEqual(validProposal[1]);
    // "a" was re-placed by the heuristic in the first free slot
    expect(
      result.blocks.filter((b) => b.taskId === 'a').reduce((sum, b) => sum + durationMinutes(b), 0),
    ).toBe(90);
    expect(result.unscheduled).toEqual([]);
  });

  it('keeps the first proposal when the retry is worse', async () => {
    const partlyWrong = [
      block('a', '2026-11-09T16:00', '2026-11-09T17:30'),
      validProposal[1] as EngineBlock,
    ];
    const { propose } = scripted(partlyWrong, []);
    const result = await planRoutine({ tasks, context: ctx, propose });
    expect(result.source).toBe('AI_REPAIRED');
    expect(result.blocks).toContainEqual(validProposal[1]);
  });

  it('prefers a retry with the same coverage but fewer problems', async () => {
    const first = [
      validProposal[0] as EngineBlock,
      block('b', '2026-11-09T12:00', '2026-11-09T13:00'),
      block('ghost', '2026-11-09T20:30', '2026-11-09T21:00'),
    ];
    const second = [validProposal[0] as EngineBlock];
    const { propose } = scripted(first, second);
    const result = await planRoutine({ tasks, context: ctx, propose });
    expect(result.source).toBe('AI_REPAIRED');
    expect(result.blocks).toHaveLength(2);
  });

  it('keeps the first proposal when the retry call fails', async () => {
    const partlyWrong = [
      block('a', '2026-11-09T16:00', '2026-11-09T17:30'),
      validProposal[1] as EngineBlock,
    ];
    const { propose } = scripted(partlyWrong, llmError('RATE_LIMIT'));
    const result = await planRoutine({ tasks, context: ctx, propose });
    expect(result.source).toBe('AI_REPAIRED');
    expect(result.blocks).toHaveLength(2);
  });

  it('falls back to the heuristic when nothing in the proposal is usable', async () => {
    const garbage = [
      block('a', '2026-11-09T09:00', '2026-11-09T10:30'),
      block('b', '2026-11-09T12:00', '2026-11-09T13:00'),
    ];
    const { propose } = scripted(garbage, garbage);
    const result = await planRoutine({ tasks, context: ctx, propose });
    expect(result.source).toBe('HEURISTIC');
    expect(result.notice).toBe(INVALID_PROPOSAL_NOTICE);
    expect(result.blocks).toHaveLength(2);
  });

  it.each([
    ['RATE_LIMIT', 'limite de uso'],
    ['TIMEOUT', 'demorou demais'],
    ['VALIDATION', 'resposta inválida'],
    ['UNAVAILABLE', 'indisponível'],
    ['OVERLOADED', 'sobrecarregada'],
    ['PROVIDER', 'Não foi possível usar a IA'],
  ])('falls back to the heuristic when the AI fails with %s', async (kind, text) => {
    const { propose, requests } = scripted(llmError(kind));
    const result = await planRoutine({ tasks, context: ctx, propose });
    expect(result.source).toBe('HEURISTIC');
    expect(result.notice).toContain(text);
    expect(result.notice).toContain('sem IA');
    expect(result.blocks).toHaveLength(2);
    expect(requests).toHaveLength(1);
  });

  it('survives a non-error rejection from the AI', async () => {
    const propose: ProposeFn = () => Promise.reject(null);
    const result = await planRoutine({ tasks, context: ctx, propose });
    expect(result.source).toBe('HEURISTIC');
  });

  it('never sends impossible tasks to the AI and reports them', async () => {
    const impossible = task('late', { minutes: 300, deadline: at('2026-11-09T18:00') });
    const passed = task('old', { deadline: at('2026-11-08T18:00') });
    const { propose, requests } = scripted(validProposal);
    const result = await planRoutine({
      tasks: [...tasks, impossible, passed],
      context: ctx,
      propose,
    });
    expect(requests[0]?.tasks.map((t) => t.id)).toEqual(['a', 'b']);
    expect(result.source).toBe('AI');
    expect(result.unscheduled).toEqual([
      { taskId: 'late', reason: 'DEADLINE_IMPOSSIBLE', missingMinutes: 180 },
      { taskId: 'old', reason: 'DEADLINE_PASSED', missingMinutes: 60 },
    ]);
  });

  it('does not call the AI when nothing can be planned', async () => {
    const { propose, requests } = scripted();
    const nothing = await planRoutine({
      tasks: [task('done', { minutes: 0 })],
      context: ctx,
      propose,
    });
    expect(nothing).toEqual({ blocks: [], unscheduled: [], source: 'AI', notice: null });
    const onlyImpossible = await planRoutine({
      tasks: [task('old', { deadline: at('2026-11-08T18:00') })],
      context: ctx,
    });
    expect(onlyImpossible).toMatchObject({ blocks: [], source: 'HEURISTIC', notice: null });
    expect(onlyImpossible.unscheduled).toHaveLength(1);
    expect(requests).toHaveLength(0);
  });

  it('reports tasks that fit alone but not together', async () => {
    const oneDay = context({ rangeEnd: '2026-11-09', commitments: workWeek });
    const result = await planRoutine({
      tasks: [
        task('a', { minutes: 240, deadline: at('2026-11-09T22:00'), priority: 'URGENT' }),
        task('b', { minutes: 240, deadline: at('2026-11-09T22:00') }),
      ],
      context: oneDay,
    });
    expect(result.blocks.every((b) => b.taskId === 'a')).toBe(true);
    expect(result.unscheduled).toEqual([
      expect.objectContaining({ taskId: 'b', reason: 'DEADLINE_IMPOSSIBLE' }),
    ]);
  });

  it('preserves locked blocks: nothing is placed on or right next to them', async () => {
    const locked = block('z', '2026-11-09T17:30', '2026-11-09T18:30');
    const withLocked = context({ commitments: workWeek, fixedBlocks: [locked] });
    const { propose } = scripted([block('a', '2026-11-09T17:00', '2026-11-09T18:30')], []);
    const result = await planRoutine({
      tasks: [task('a', { minutes: 90 })],
      context: withLocked,
      propose,
    });
    expect(result.source).toBe('HEURISTIC');
    for (const placed of result.blocks) {
      expect(
        placed.end + 15 * MINUTE_MS <= locked.start || placed.start >= locked.end + 15 * MINUTE_MS,
      ).toBe(true);
    }
  });
});

// ─── Property test ───────────────────────────────────────────────────────────
// Whatever the "AI" answers, the final routine must satisfy every hard rule.

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertValidRoutine(
  result: PlanResult,
  tasks: EngineTask[],
  planning: PlanningContext,
): void {
  const { prefs: p } = planning;
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const breakMs = p.minBreakMinutes * MINUTE_MS;
  const commitments = expandCommitments(planning.commitments, planning.rangeStart, 7, p.timezone);
  const all = [...result.blocks, ...planning.fixedBlocks].sort((a, b) => a.start - b.start);

  for (const placed of result.blocks) {
    const owner = taskById.get(placed.taskId);
    if (!owner) throw new Error(`block for unknown task ${placed.taskId}`);
    const date = utcToZonedParts(placed.start, p.timezone).date;
    const day = dayWindow(date, p);
    expect(placed.start % (15 * MINUTE_MS)).toBe(0);
    expect(placed.end % (15 * MINUTE_MS)).toBe(0);
    expect(placed.end).toBeGreaterThan(placed.start);
    expect(placed.start).toBeGreaterThanOrEqual(Math.max(day.start, planning.now));
    expect(placed.end).toBeLessThanOrEqual(day.end);
    expect(placed.end).toBeLessThanOrEqual(owner.deadline);
    expect(durationMinutes(placed)).toBeLessThanOrEqual(p.maxFocusBlockMinutes);
    expect(overlaps(placed, lunchInterval(date, p))).toBe(false);
    expect(commitments.some((c) => overlaps(placed, c))).toBe(false);
  }
  for (let i = 1; i < all.length; i += 1) {
    const previous = all[i - 1] as EngineBlock;
    const current = all[i] as EngineBlock;
    const bothFixed =
      planning.fixedBlocks.includes(previous) && planning.fixedBlocks.includes(current);
    if (!bothFixed) expect(current.start - previous.end).toBeGreaterThanOrEqual(breakMs);
  }
  const unscheduledIds = new Set(result.unscheduled.map((u) => u.taskId));
  for (const t of tasks) {
    const own = result.blocks.filter((b) => b.taskId === t.id);
    const total = own.reduce((sum, b) => sum + durationMinutes(b), 0);
    if (unscheduledIds.has(t.id)) {
      expect(total).toBe(0); // all or nothing
    } else {
      expect(total).toBe(t.minutes);
      if (!t.splittable) expect(own.length).toBe(1);
    }
  }
}

describe('planRoutine — invariants hold for any AI answer', () => {
  it('produces a valid routine for 300 random scenarios', async () => {
    const random = mulberry32(20261110);
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const hhmm = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

    for (let scenario = 0; scenario < 300; scenario += 1) {
      const commitments: SchedulingCommitment[] = Array.from({ length: int(0, 4) }, (_, index) => {
        const start = int(7 * 4, 20 * 4) * 15;
        return {
          id: `c${index}`,
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6].filter(() => random() < 0.6),
          startTime: hhmm(start),
          endTime: hhmm(Math.min(start + int(1, 16) * 15, 22 * 60)),
        };
      });
      const scenarioPrefs = {
        ...prefs,
        maxFocusBlockMinutes: int(2, 8) * 15,
        minBreakMinutes: int(0, 2) * 15,
      };
      const now = at('2026-11-09T06:00') + int(0, 30) * 7 * MINUTE_MS;
      const base: PlanningContext = {
        prefs: scenarioPrefs,
        commitments,
        rangeStart: '2026-11-09',
        rangeEnd: '2026-11-15',
        now,
        fixedBlocks: [],
      };
      const tasks: EngineTask[] = Array.from({ length: int(0, 8) }, (_, index) => ({
        id: `t${index}`,
        title: `Tarefa ${index}`,
        priority: PRIORITIES[int(0, 3)] as EngineTask['priority'],
        deadline: at('2026-11-09T07:00') + int(-4, 7 * 24 * 4) * 15 * MINUTE_MS,
        complexity: int(1, 5),
        minutes: int(1, 20) * 15,
        splittable: random() < 0.6,
      }));

      // Locked blocks come from a previous valid plan of one extra task.
      const lockedTask: EngineTask = {
        ...task('locked'),
        minutes: 60,
        deadline: at('2026-11-15T22:00'),
      };
      const fixedBlocks = (await planRoutine({ tasks: [lockedTask], context: base })).blocks;
      const planning = { ...base, fixedBlocks };

      // The "AI" answers with a mix of plausible and garbage blocks.
      const propose: ProposeFn = async ({ tasks: asked }) => {
        if (random() < 0.15) throw llmError('RATE_LIMIT');
        return asked.flatMap((t) =>
          Array.from({ length: int(0, 3) }, () => {
            const start =
              at('2026-11-09T05:00') +
              int(0, 7 * 24 * 4) * 15 * MINUTE_MS +
              (random() < 0.1 ? 60_000 : 0);
            const length =
              random() < 0.5
                ? Math.min(t.minutes, scenarioPrefs.maxFocusBlockMinutes)
                : int(1, 10) * 15;
            return {
              taskId: random() < 0.05 ? 'ghost' : t.id,
              start,
              end: start + length * MINUTE_MS,
            };
          }),
        );
      };

      const result = await planRoutine({
        tasks,
        context: planning,
        propose: random() < 0.8 ? propose : undefined,
      });
      assertValidRoutine(result, tasks, planning);
    }
  });
});
