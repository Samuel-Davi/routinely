import type { INestApplication } from '@nestjs/common';
import {
  checkPlacement,
  fromLocalDateTime,
  toLocalDateTime,
  DEFAULT_PREFERENCES,
  type Routine,
  type RoutineBlock,
} from '@routinely/shared';
import request from 'supertest';
import { LLM_PROVIDER, LlmError } from '../src/ai/llm-provider';
import { Clock } from '../src/common/clock';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RoutinesService } from '../src/routines/routines.service';
import { TaskEstimationWorker } from '../src/tasks/task-estimation.worker';
import { FakeLlmProvider } from '../src/testing/fake-llm-provider';
import { createTestApp, resetDatabase } from './test-app';

const TZ = 'America/Manaus';
const at = (local: string) => new Date(fromLocalDateTime(local, TZ));
const iso = (local: string) => at(local).toISOString();
const local = (instant: string) => toLocalDateTime(Date.parse(instant), TZ);

// Monday morning, before the day starts.
const MONDAY = '2026-11-09T06:00';
const work = [
  {
    title: 'Trabalho',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '08:00',
    endTime: '12:00',
    category: 'WORK',
    color: 'blue',
  },
  {
    title: 'Trabalho',
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '13:00',
    endTime: '17:00',
    category: 'WORK',
    color: 'blue',
  },
];

describe('Routines (e2e, mocked LLM)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let routines: RoutinesService;
  let estimation: TaskEstimationWorker;
  const llm = new FakeLlmProvider();
  const clock = { current: at(MONDAY), now: () => clock.current };
  const http = () => request(app.getHttpServer());

  /** Creates a task with a manual estimate so no LLM call is needed for it. */
  async function createTask(title: string, minutes: number, deadline: string, extra: object = {}) {
    const created = await http()
      .post('/tasks')
      .send({ title, description: '', priority: 'MEDIUM', deadline: iso(deadline), ...extra })
      .expect(201);
    await estimation.idle();
    const response = await http()
      .patch(`/tasks/${created.body.id}`)
      .send({ estimate: { complexity: 3, estimatedMinutes: minutes, splittable: true } })
      .expect(200);
    llm.calls.length = 0; // ignore the estimation attempt made on creation
    return response.body as { id: string; title: string };
  }

  async function generate(body: object = {}, path = '/routines/generate'): Promise<Routine> {
    const started = await http().post(path).send(body).expect(202);
    expect(started.body.status).toBe('PENDING');
    await routines.idle();
    const routine = await http().get(`/routines/${started.body.id}`).expect(200);
    return routine.body as Routine;
  }
  const replan = () => generate({}, '/routines/replan');

  async function assertNoConflicts(routine: Routine) {
    const commitments = (await http().get('/fixed-commitments')).body;
    for (const block of routine.blocks) {
      const others = routine.blocks.filter((other) => other.id !== block.id);
      const violations = checkPlacement(
        { start: Date.parse(block.start), end: Date.parse(block.end) },
        {
          prefs: DEFAULT_PREFERENCES,
          commitments,
          otherBlocks: others.map((o) => ({ start: Date.parse(o.start), end: Date.parse(o.end) })),
          deadline: Date.parse(block.task.deadline),
        },
      );
      expect(violations).toEqual([]);
    }
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder.overrideProvider(LLM_PROVIDER).useValue(llm).overrideProvider(Clock).useValue(clock),
    ));
    routines = app.get(RoutinesService);
    estimation = app.get(TaskEstimationWorker);
  });
  beforeEach(async () => {
    await estimation.idle();
    await routines.idle();
    await resetDatabase(prisma);
    llm.calls.length = 0;
    llm.clear();
    llm.configured = false; // heuristic by default; tests opt in to the AI
    clock.current = at(MONDAY);
    for (const commitment of work)
      await http().post('/fixed-commitments').send(commitment).expect(201);
  });
  afterAll(() => app.close());

  it('has no routine and no suggestion at first', async () => {
    const active = await http().get('/routines/active').expect(200);
    expect(active.body).toEqual({ routine: null });
    const suggestion = await http().get('/routines/replan-suggestion').expect(200);
    expect(suggestion.body).toEqual({ needsReplan: false, reasons: [] });
    expect((await http().get('/routines').expect(200)).body).toEqual([]);
  });

  it('generates a routine without AI and flags it', async () => {
    const report = await createTask('Relatório', 150, '2026-11-11T22:00');
    await createTask('Estudar', 60, '2026-11-13T22:00');

    const routine = await generate();
    expect(routine).toMatchObject({
      status: 'READY',
      source: 'HEURISTIC',
      trigger: 'GENERATE',
      active: true,
      version: 1,
      rangeStart: '2026-11-09',
      rangeEnd: '2026-11-15',
      unscheduled: [],
    });
    expect(routine.notice).toContain('sem IA');
    expect(routine.diffSummary).toEqual({
      added: routine.blocks.length,
      removed: 0,
      moved: 0,
      kept: 0,
    });
    expect(local(routine.blocks[0]!.start)).toBe('2026-11-09T07:00');
    const reportMinutes = routine.blocks
      .filter((block) => block.taskId === report.id)
      .reduce((sum, block) => sum + (Date.parse(block.end) - Date.parse(block.start)) / 60_000, 0);
    expect(reportMinutes).toBe(150);
    await assertNoConflicts(routine);

    const active = await http().get('/routines/active').expect(200);
    expect(active.body.routine.id).toBe(routine.id);
    const tasks = await http().get('/tasks').expect(200);
    expect(tasks.body.every((task: { status: string }) => task.status === 'SCHEDULED')).toBe(true);
  });

  it('uses a valid AI proposal as is', async () => {
    const task = await createTask('Relatório', 60, '2026-11-11T22:00');
    llm.configured = true;
    llm.reply({
      allocations: [
        {
          taskId: 'T1',
          start: '2026-11-10T17:00',
          end: '2026-11-10T18:00',
          rationale: 'Depois do trabalho.',
        },
      ],
    });

    const routine = await generate();
    expect(routine).toMatchObject({ source: 'AI', notice: null });
    expect(routine.blocks).toHaveLength(1);
    expect(routine.blocks[0]).toMatchObject({
      taskId: task.id,
      start: iso('2026-11-10T17:00'),
      end: iso('2026-11-10T18:00'),
      rationale: 'Depois do trabalho.',
      locked: false,
    });
    const prompt = llm.calls[0]!.prompt;
    expect(prompt).toContain('2026-11-09 (segunda): 07:00–08:00, 17:00–22:00');
    expect(prompt).toContain('T1 | "Relatório" | prioridade MEDIUM | prazo 2026-11-11T22:00');
  });

  it('retries an invalid AI proposal with feedback and then repairs it deterministically', async () => {
    await createTask('Relatório', 60, '2026-11-11T22:00');
    llm.configured = true;
    const duringWork = {
      allocations: [
        { taskId: 'T1', start: '2026-11-10T09:00', end: '2026-11-10T10:00', rationale: 'x' },
      ],
    };
    llm.reply(duringWork, duringWork);

    const routine = await generate();
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]!.tier).toBe('retry');
    expect(llm.calls[1]!.prompt).toContain('sobrepõe um compromisso fixo');
    expect(routine.source).toBe('HEURISTIC');
    expect(routine.notice).toContain('não passou na validação');
    await assertNoConflicts(routine);
    expect(routine.blocks).toHaveLength(1);
  });

  it('falls back to the heuristic after repeated rate limits', async () => {
    await createTask('Relatório', 60, '2026-11-11T22:00');
    llm.configured = true;
    llm.reply(...Array.from({ length: 3 }, () => new LlmError('RATE_LIMIT', '429')));

    const routine = await generate();
    expect(llm.calls).toHaveLength(3);
    expect(routine.source).toBe('HEURISTIC');
    expect(routine.notice).toContain('limite de uso');
    expect(routine.blocks).toHaveLength(1);
  });

  it('never schedules past an impossible deadline and reports unestimated tasks', async () => {
    const impossible = await createTask('Impossível', 600, '2026-11-09T20:00');
    const fine = await createTask('Possível', 60, '2026-11-13T22:00');
    const pending = await prisma.task.create({
      data: {
        userId: '00000000-0000-4000-8000-000000000001',
        title: 'Sem estimativa',
        deadline: at('2026-11-13T22:00'),
        estimationStatus: 'FAILED',
      },
    });

    const routine = await generate();
    expect(routine.blocks.map((block) => block.taskId)).toEqual([fine.id]);
    expect(routine.unscheduled).toEqual(
      expect.arrayContaining([
        {
          taskId: impossible.id,
          title: 'Impossível',
          reason: 'DEADLINE_IMPOSSIBLE',
          missingMinutes: 375,
        },
        { taskId: pending.id, title: 'Sem estimativa', reason: 'NOT_ESTIMATED', missingMinutes: 0 },
      ]),
    );
    const tasks = (await http().get('/tasks')).body as { id: string; status: string }[];
    expect(tasks.find((task) => task.id === impossible.id)?.status).toBe('TODO');
  });

  it('plans up to the latest deadline, capped at four weeks', async () => {
    await createTask('Longe', 60, '2026-11-25T22:00');
    const routine = await generate({ untilLastDeadline: true });
    expect(routine).toMatchObject({ rangeStart: '2026-11-09', rangeEnd: '2026-11-29' });
  });

  it('rejects generating a week in the past and a second concurrent generation', async () => {
    await http().post('/routines/generate').send({ weekStart: '2026-11-02' }).expect(400);
    await http().post('/routines/generate').send({ weekStart: 'next week' }).expect(400);

    await createTask('Relatório', 60, '2026-11-11T22:00');
    llm.configured = true;
    let release: (value: unknown) => void = () => undefined;
    llm.reply(() => new Promise((resolve) => (release = resolve)));
    await http().post('/routines/generate').send({}).expect(202);
    const conflict = await http().post('/routines/generate').send({}).expect(409);
    expect(conflict.body.code).toBe('GENERATION_IN_PROGRESS');
    await new Promise((resolve) => setTimeout(resolve, 50));
    release({ allocations: [] });
    await routines.idle();
  });

  describe('with a generated routine', () => {
    let taskA: { id: string };
    let routine: Routine;
    const blockOf = (source: Routine, taskId: string) =>
      source.blocks.find((block) => block.taskId === taskId) as RoutineBlock;

    beforeEach(async () => {
      taskA = await createTask('Relatório', 60, '2026-11-12T22:00');
      await createTask('Estudar', 60, '2026-11-13T22:00');
      routine = await generate();
      // A: Mon 07:00–08:00, Estudar: Mon 17:00–18:00
      expect(routine.blocks.map((block) => local(block.start))).toEqual([
        '2026-11-09T07:00',
        '2026-11-09T17:00',
      ]);
    });

    it('moves a block, locks it and keeps it when replanning', async () => {
      const block = blockOf(routine, taskA.id);
      const moved = await http()
        .patch(`/routines/blocks/${block.id}`)
        .send({ start: iso('2026-11-10T19:00'), end: iso('2026-11-10T20:15') })
        .expect(200);
      expect(moved.body).toMatchObject({
        locked: true,
        start: iso('2026-11-10T19:00'),
        end: iso('2026-11-10T20:15'),
      });

      const next = await replan();
      expect(next).toMatchObject({ version: 2, trigger: 'REPLAN', active: true });
      const kept = blockOf(next, taskA.id);
      expect(kept).toMatchObject({
        locked: true,
        start: iso('2026-11-10T19:00'),
        end: iso('2026-11-10T20:15'),
      });
      // the locked block already covers the task: nothing else is planned for it
      expect(next.blocks.filter((b) => b.taskId === taskA.id)).toHaveLength(1);
      // the other task moved up to the freed Monday 07:00 slot
      expect(next.diffSummary).toEqual({ added: 0, removed: 0, moved: 1, kept: 1 });
      await assertNoConflicts(next);

      const previous = await http().get(`/routines/${routine.id}`).expect(200);
      expect(previous.body.active).toBe(false);
    });

    it('rejects a move that conflicts, listing the violations', async () => {
      const block = blockOf(routine, taskA.id);
      const overCommitment = await http()
        .patch(`/routines/blocks/${block.id}`)
        .send({ start: iso('2026-11-10T09:00'), end: iso('2026-11-10T10:00') })
        .expect(409);
      expect(overCommitment.body).toMatchObject({
        code: 'BLOCK_CONFLICT',
        details: { violations: ['OVERLAPS_COMMITMENT'] },
      });

      const overBlock = await http()
        .patch(`/routines/blocks/${block.id}`)
        .send({ start: iso('2026-11-09T17:30'), end: iso('2026-11-09T18:30') })
        .expect(409);
      expect(overBlock.body.details.violations).toEqual(['OVERLAPS_BLOCK']);

      const pastDeadline = await http()
        .patch(`/routines/blocks/${block.id}`)
        .send({ start: iso('2026-11-13T19:00'), end: iso('2026-11-13T20:00') })
        .expect(409);
      expect(pastDeadline.body.details.violations).toEqual(['AFTER_DEADLINE']);

      clock.current = at('2026-11-09T07:30');
      const inThePast = await http()
        .patch(`/routines/blocks/${block.id}`)
        .send({ start: iso('2026-11-09T07:00'), end: iso('2026-11-09T07:45') })
        .expect(409);
      expect(inThePast.body.details.violations).toEqual(['IN_THE_PAST']);

      await http()
        .patch(`/routines/blocks/${block.id}`)
        .send({ start: iso('2026-11-10T19:00') })
        .expect(400);
      const unchanged = await http().get('/routines/active').expect(200);
      expect(blockOf(unchanged.body.routine, taskA.id)).toMatchObject({
        start: block.start,
        locked: false,
      });
    });

    it('locks and unlocks a block', async () => {
      const block = blockOf(routine, taskA.id);
      const locked = await http()
        .patch(`/routines/blocks/${block.id}/lock`)
        .send({ locked: true })
        .expect(200);
      expect(locked.body.locked).toBe(true);
      const unlocked = await http()
        .patch(`/routines/blocks/${block.id}/lock`)
        .send({ locked: false })
        .expect(200);
      expect(unlocked.body.locked).toBe(false);
    });

    it('completes a block, finishing the task, and preserves it on replan', async () => {
      const block = blockOf(routine, taskA.id);
      clock.current = at('2026-11-09T08:00');
      const done = await http()
        .patch(`/routines/blocks/${block.id}/complete`)
        .send({ completed: true })
        .expect(200);
      expect(done.body.completedAt).toBe(iso('2026-11-09T08:00'));
      expect(done.body.task.status).toBe('DONE');
      expect((await http().get(`/tasks/${taskA.id}`)).body.status).toBe('DONE');

      await http()
        .patch(`/routines/blocks/${block.id}`)
        .send({ start: iso('2026-11-10T19:00'), end: iso('2026-11-10T20:00') })
        .expect(409);

      const next = await replan();
      expect(blockOf(next, taskA.id)).toMatchObject({
        start: block.start,
        completedAt: iso('2026-11-09T08:00'),
      });

      const completedBlock = blockOf(next, taskA.id);
      const reopened = await http()
        .patch(`/routines/blocks/${completedBlock.id}/complete`)
        .send({ completed: false })
        .expect(200);
      expect(reopened.body).toMatchObject({ completedAt: null, task: { status: 'SCHEDULED' } });
    });

    it('replans overdue work and suggests it beforehand', async () => {
      // Tuesday morning: Monday's blocks were never completed.
      clock.current = at('2026-11-10T06:00');
      const suggestion = await http().get('/routines/replan-suggestion').expect(200);
      expect(suggestion.body).toEqual({
        needsReplan: true,
        reasons: [{ code: 'OVERDUE_BLOCK', count: 2 }],
      });

      const next = await replan();
      expect(next.blocks.map((block) => local(block.start))).toEqual([
        '2026-11-10T07:00',
        '2026-11-10T17:00',
      ]);
      expect(next.diffSummary).toEqual({ added: 0, removed: 0, moved: 2, kept: 0 });
      const after = await http().get('/routines/replan-suggestion').expect(200);
      expect(after.body.needsReplan).toBe(false);
    });

    it('suggests a replan for new tasks, changed tasks and schedule changes', async () => {
      clock.current = at('2026-11-09T06:30');
      await createTask('Nova tarefa', 30, '2026-11-13T22:00');
      await http()
        .patch(`/tasks/${taskA.id}`)
        .send({ deadline: iso('2026-11-11T22:00') })
        .expect(200);
      await http()
        .post('/fixed-commitments')
        .send({
          title: 'Dentista',
          daysOfWeek: [1],
          startTime: '17:00',
          endTime: '18:00',
          category: 'HEALTH',
          color: 'green',
        })
        .expect(201);

      const suggestion = await http().get('/routines/replan-suggestion').expect(200);
      expect(suggestion.body.needsReplan).toBe(true);
      expect(suggestion.body.reasons).toEqual([
        { code: 'NEW_TASK', count: 1 },
        { code: 'TASK_CHANGED', count: 1 },
        { code: 'SCHEDULE_CHANGED', count: 1 },
      ]);

      const next = await replan();
      await assertNoConflicts(next);
      expect(next.blocks).toHaveLength(3);
      expect(next.blocks.some((block) => local(block.start) === '2026-11-09T17:00')).toBe(false);
    });

    it('drops the blocks of a task finished outside the calendar', async () => {
      await http().patch(`/tasks/${taskA.id}`).send({ status: 'DONE' }).expect(200);
      const next = await replan();
      expect(next.blocks.some((block) => block.taskId === taskA.id)).toBe(false);
      expect(next.diffSummary).toMatchObject({ removed: 1 });
    });

    it('lists the history and restores an old version', async () => {
      const block = blockOf(routine, taskA.id);
      await http()
        .patch(`/routines/blocks/${block.id}`)
        .send({ start: iso('2026-11-10T19:00'), end: iso('2026-11-10T20:00') })
        .expect(200);
      const second = await replan();

      const history = await http().get('/routines').expect(200);
      expect(
        history.body.map((item: { version: number; active: boolean; blockCount: number }) => [
          item.version,
          item.active,
          item.blockCount,
        ]),
      ).toEqual([
        [2, true, 2],
        [1, false, 2],
      ]);

      // Version 1 holds the block where it was after the manual move (edits change the active version).
      const restored = await http().post(`/routines/${routine.id}/restore`).expect(201);
      expect(restored.body).toMatchObject({
        version: 3,
        trigger: 'RESTORE',
        active: true,
        status: 'READY',
      });
      expect(restored.body.notice).toBe('Versão 1 restaurada.');
      expect(restored.body.blocks).toHaveLength(2);
      await assertNoConflicts(restored.body);
      expect((await http().get(`/routines/${second.id}`)).body.active).toBe(false);
    });

    it('restores only what is still valid', async () => {
      clock.current = at('2026-11-09T07:30');
      const first = blockOf(routine, taskA.id);
      await http()
        .patch(`/routines/blocks/${first.id}/complete`)
        .send({ completed: true })
        .expect(200);
      await replan();
      // A new commitment now covers Monday 17:00, where version 1 had a block.
      await http()
        .post('/fixed-commitments')
        .send({
          title: 'Dentista',
          daysOfWeek: [1],
          startTime: '17:00',
          endTime: '18:00',
          category: 'HEALTH',
          color: 'green',
        })
        .expect(201);

      const restored = await http().post(`/routines/${routine.id}/restore`).expect(201);
      expect(restored.body.blocks).toHaveLength(1);
      expect(restored.body.blocks[0].completedAt).not.toBeNull();
      expect(restored.body.notice).toContain('1 bloco(s) não puderam ser restaurados');
    });

    it('refuses to edit blocks of an old version and unknown blocks', async () => {
      const old = blockOf(routine, taskA.id);
      await replan();
      const response = await http()
        .patch(`/routines/blocks/${old.id}/complete`)
        .send({ completed: true })
        .expect(409);
      expect(response.body.code).toBe('ROUTINE_NOT_ACTIVE');
      await http()
        .patch('/routines/blocks/6f1c2d3e-4b5a-4c6d-8e7f-901234567890/lock')
        .send({ locked: true })
        .expect(404);
      await http().get('/routines/6f1c2d3e-4b5a-4c6d-8e7f-901234567890').expect(404);
      await http().post('/routines/6f1c2d3e-4b5a-4c6d-8e7f-901234567890/restore').expect(404);
    });
  });

  it('replan without a routine generates the current week', async () => {
    await createTask('Relatório', 60, '2026-11-11T22:00');
    const routine = await replan();
    expect(routine).toMatchObject({ trigger: 'GENERATE', version: 1, rangeStart: '2026-11-09' });
  });
});
