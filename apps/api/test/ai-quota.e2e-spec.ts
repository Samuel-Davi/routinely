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
