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
const iso = (local: string) => new Date(fromLocalDateTime(local, TZ)).toISOString();

describe('AI input budget (e2e, mocked LLM)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const llm = new FakeLlmProvider();
  const clock = { now: () => new Date(fromLocalDateTime('2026-11-09T06:00', TZ)) };
  let http: HttpFn;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder
        .overrideProvider(LLM_PROVIDER)
        .useValue(llm)
        .overrideProvider(Clock)
        .useValue(clock)
        // The smallest allowed budget is below the size of the system prompt alone.
        .overrideProvider(APP_CONFIG)
        .useValue({ ...loadEnv(), LLM_MAX_INPUT_TOKENS: 500 }),
    ));
    http = asUser(app);
  });
  afterAll(() => app.close());

  it('sends only the most urgent task to the AI and leaves the rest to the heuristic', async () => {
    await app.get(TaskEstimationWorker).idle();
    await resetDatabase(prisma);
    llm.configured = true;
    const make = async (title: string, priority: string, deadline: string) => {
      const created = await http()
        .post('/tasks')
        .send({ title, description: '', priority, deadline: iso(deadline) })
        .expect(201);
      await app.get(TaskEstimationWorker).idle();
      await http()
        .patch(`/tasks/${created.body.id}`)
        .send({ estimate: { complexity: 2, estimatedMinutes: 60, splittable: true } })
        .expect(200);
      return created.body.id as string;
    };
    const urgent = await make('Urgente', 'URGENT', '2026-11-10T22:00');
    const later = await make('Depois', 'LOW', '2026-11-13T22:00');
    llm.clear();
    llm.calls.length = 0;
    llm.reply({
      allocations: [
        { taskId: 'T1', start: '2026-11-09T08:00', end: '2026-11-09T09:00', rationale: 'ok' },
      ],
    });

    const started = await http().post('/routines/generate').send({}).expect(202);
    await app.get(RoutinesService).idle();
    const routine = (await http().get(`/routines/${started.body.id}`).expect(200)).body as Routine;

    const prompt = llm.calls[0]!.prompt;
    expect(prompt).toContain('T1 | "Urgente"');
    expect(prompt).not.toContain('Depois');
    expect(routine.blocks.map((block) => block.taskId).sort()).toEqual([urgent, later].sort());
    expect(routine.unscheduled).toEqual([]);
  });
});
