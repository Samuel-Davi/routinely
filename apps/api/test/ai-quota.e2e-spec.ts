import type { INestApplication } from '@nestjs/common';
import { fromLocalDateTime, type Routine } from '@routinely/shared';
import { LLM_PROVIDER } from '../src/ai/llm-provider';
import { Clock } from '../src/common/clock';
import { APP_CONFIG } from '../src/config/config.module';
import { loadEnv } from '../src/config/env';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RoutinesService } from '../src/routines/routines.service';
import { TaskEstimationWorker } from '../src/tasks/task-estimation.worker';
import { FakeLlmProvider } from '../src/testing/fake-llm-provider';
import { asUser, createTestApp, resetDatabase, type HttpFn } from './test-app';

const TZ = 'America/Manaus';
const at = (local: string) => new Date(fromLocalDateTime(local, TZ));

describe('Daily AI limit per user (e2e, mocked LLM)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: HttpFn;
  const llm = new FakeLlmProvider();
  const clock = { current: at('2026-11-09T06:00'), now: () => clock.current };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder
        .overrideProvider(LLM_PROVIDER)
        .useValue(llm)
        .overrideProvider(Clock)
        .useValue(clock)
        .overrideProvider(APP_CONFIG)
        .useValue({ ...loadEnv(), AI_DAILY_LIMIT: 1 }),
    ));
    http = asUser(app);
  });
  afterAll(() => app.close());

  const estimate = { complexity: 2, estimatedMinutes: 60, splittable: true, rationale: 'IA' };
  async function createTask(title: string) {
    const created = await http()
      .post('/tasks')
      .send({
        title,
        description: '',
        priority: 'MEDIUM',
        deadline: at('2026-11-12T22:00').toISOString(),
      })
      .expect(201);
    await app.get(TaskEstimationWorker).idle();
    return (await http().get(`/tasks/${created.body.id}`).expect(200)).body;
  }

  it('falls back to the heuristic once the user spent the daily budget, and resets next day', async () => {
    await resetDatabase(prisma);
    llm.configured = true;
    llm.clear();
    llm.calls.length = 0;
    llm.reply(estimate, estimate);

    const first = await createTask('Primeira');
    expect(first.estimationSource).toBe('AI');
    const second = await createTask('Segunda');
    expect(second.estimationSource).toBe('HEURISTIC');
    expect(llm.calls).toHaveLength(1);

    // the generation also finds the budget spent: heuristic plan, clear notice
    const started = (await http().post('/routines/generate').send({}).expect(202)).body;
    await app.get(RoutinesService).idle();
    const routine = (await http().get(`/routines/${started.id}`).expect(200)).body as Routine;
    expect(routine.source).toBe('HEURISTIC');
    expect(routine.notice).toContain('Limite diário');
    expect(routine.blocks.length).toBeGreaterThan(0);
    expect(llm.calls).toHaveLength(1);

    // a new UTC day gives a new budget
    clock.current = at('2026-11-10T06:00');
    llm.reply(estimate);
    const third = await createTask('Terceira');
    expect(third.estimationSource).toBe('AI');
  });
});

describe('Global daily AI cap (e2e, mocked LLM)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ana: HttpFn;
  let bia: HttpFn;
  let biaId: string;
  const llm = new FakeLlmProvider();
  const clock = { current: at('2026-11-09T06:00'), now: () => clock.current };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder
        .overrideProvider(LLM_PROVIDER)
        .useValue(llm)
        .overrideProvider(Clock)
        .useValue(clock)
        // each user may use the AI 10 times a day, but everyone together only 2
        .overrideProvider(APP_CONFIG)
        .useValue({ ...loadEnv(), AI_DAILY_LIMIT: 10, AI_GLOBAL_DAILY_LIMIT: 2 }),
    ));
  });
  afterAll(() => app.close());

  const estimate = { complexity: 2, estimatedMinutes: 60, splittable: true, rationale: 'IA' };
  async function createTask(http: HttpFn, title: string) {
    const created = await http()
      .post('/tasks')
      .send({
        title,
        description: '',
        priority: 'MEDIUM',
        deadline: at('2026-11-12T22:00').toISOString(),
      })
      .expect(201);
    await app.get(TaskEstimationWorker).idle();
    return (await http().get(`/tasks/${created.body.id}`).expect(200)).body;
  }

  it('sends everyone to the heuristic once the global budget is spent, even below their own limit', async () => {
    await resetDatabase(prisma);
    const anaId = (await prisma.user.create({ data: { name: 'Ana', email: 'a@example.com' } })).id;
    biaId = (await prisma.user.create({ data: { name: 'Bia', email: 'b@example.com' } })).id;
    ana = asUser(app, anaId);
    bia = asUser(app, biaId);
    llm.configured = true;
    llm.clear();
    llm.calls.length = 0;
    llm.reply(estimate, estimate, estimate);

    // Ana spends the whole global budget (2 of her own 10)
    expect((await createTask(ana, 'Ana 1')).estimationSource).toBe('AI');
    expect((await createTask(ana, 'Ana 2')).estimationSource).toBe('AI');
    // Bia has used nothing, yet the global cap is reached
    const biaTask = await createTask(bia, 'Bia 1');
    expect(biaTask.estimationSource).toBe('HEURISTIC');
    expect(llm.calls).toHaveLength(2);

    // her generation says so
    const started = (await bia().post('/routines/generate').send({}).expect(202)).body;
    await app.get(RoutinesService).idle();
    const routine = (await bia().get(`/routines/${started.id}`).expect(200)).body as Routine;
    expect(routine.source).toBe('HEURISTIC');
    expect(routine.notice).toBe('Limite diário de IA atingido. Rotina gerada sem IA.');
    expect(llm.calls).toHaveLength(2);

    // being over the global cap did not burn Bia's own budget; counters are as expected
    expect(await prisma.aiUsage.count({ where: { userId: biaId } })).toBe(0);
    const global = await prisma.aiGlobalUsage.findUniqueOrThrow({ where: { day: '2026-11-09' } });
    expect(global.count).toBe(2);
  });

  it('starts a fresh global budget on the next UTC day', async () => {
    // the next UTC day starts a fresh global budget
    clock.current = at('2026-11-10T06:00');
    llm.reply(estimate);
    expect((await createTask(bia, 'Bia 2')).estimationSource).toBe('AI');
    const global = await prisma.aiGlobalUsage.findUniqueOrThrow({ where: { day: '2026-11-10' } });
    expect(global.count).toBe(1);
  });
});

describe('Individual limit gives the global use back (e2e, mocked LLM)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const llm = new FakeLlmProvider();
  const clock = { now: () => at('2026-11-09T06:00') };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder
        .overrideProvider(LLM_PROVIDER)
        .useValue(llm)
        .overrideProvider(Clock)
        .useValue(clock)
        .overrideProvider(APP_CONFIG)
        .useValue({ ...loadEnv(), AI_DAILY_LIMIT: 1, AI_GLOBAL_DAILY_LIMIT: 5 }),
    ));
  });
  afterAll(() => app.close());

  it('does not leak global uses when a user is over their own limit', async () => {
    await resetDatabase(prisma);
    const http = asUser(app);
    llm.configured = true;
    llm.clear();
    llm.reply({ complexity: 2, estimatedMinutes: 60, splittable: true, rationale: 'IA' });
    for (const title of ['Um', 'Dois', 'Tres']) {
      await http()
        .post('/tasks')
        .send({
          title,
          description: '',
          priority: 'LOW',
          deadline: at('2026-11-12T22:00').toISOString(),
        })
        .expect(201);
      await app.get(TaskEstimationWorker).idle();
    }
    // 1 AI estimation; the 2 refused ones returned their global use
    const global = await prisma.aiGlobalUsage.findUniqueOrThrow({ where: { day: '2026-11-09' } });
    expect(global.count).toBe(1);
  });
});
