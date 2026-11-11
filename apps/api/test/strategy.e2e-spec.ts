import type { INestApplication } from '@nestjs/common';
import { fromLocalDateTime, type Routine } from '@routinely/shared';
import request from 'supertest';
import { LLM_PROVIDER } from '../src/ai/llm-provider';
import { Clock } from '../src/common/clock';
import { APP_CONFIG } from '../src/config/config.module';
import { loadEnv } from '../src/config/env';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RoutinesService } from '../src/routines/routines.service';
import { TaskEstimationWorker } from '../src/tasks/task-estimation.worker';
import { FakeLlmProvider } from '../src/testing/fake-llm-provider';
import { createTestApp, resetDatabase } from './test-app';

const TZ = 'America/Manaus';
const iso = (local: string) => new Date(fromLocalDateTime(local, TZ)).toISOString();

describe('order-day strategy (e2e, mocked LLM)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const llm = new FakeLlmProvider();
  const clock = { now: () => new Date(fromLocalDateTime('2026-11-09T06:00', TZ)) };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder
        .overrideProvider(LLM_PROVIDER)
        .useValue(llm)
        .overrideProvider(Clock)
        .useValue(clock)
        .overrideProvider(APP_CONFIG)
        .useValue({ ...loadEnv(), AI_PLANNING_STRATEGY: 'order-day' as const }),
    ));
  });
  afterAll(() => app.close());

  async function task(title: string, minutes: number, deadline: string) {
    const created = await http()
      .post('/tasks')
      .send({ title, description: '', priority: 'MEDIUM', deadline: iso(deadline) })
      .expect(201);
    await app.get(TaskEstimationWorker).idle();
    await http()
      .patch(`/tasks/${created.body.id}`)
      .send({ estimate: { complexity: 3, estimatedMinutes: minutes, splittable: true } })
      .expect(200);
    return created.body.id as string;
  }

  it('lets the model choose order, split and day while the backend picks the times', async () => {
    await app.get(TaskEstimationWorker).idle();
    await resetDatabase(prisma);
    llm.configured = true;
    const a = await task('Relatório', 120, '2026-11-13T22:00');
    llm.clear();
    llm.calls.length = 0;
    llm.reply({
      plan: [
        {
          taskId: 'T1',
          blocks: [
            { minutes: 60, day: '2026-11-10' },
            { minutes: 60, day: '2026-11-11' },
          ],
          rationale: 'Dois dias para não concentrar.',
        },
      ],
    });

    const started = await http().post('/routines/generate').send({}).expect(202);
    await app.get(RoutinesService).idle();
    const routine = (await http().get(`/routines/${started.body.id}`).expect(200)).body as Routine;

    expect(llm.calls[0]!.name).toBe('orderRoutineDay');
    expect(routine.source).toBe('AI');
    expect(routine.blocks.map((block) => block.taskId)).toEqual([a, a]);
    // Day preference honoured; times are the backend's choice (first free window of each day).
    expect(routine.blocks[0]!.start).toBe(iso('2026-11-10T07:00'));
    expect(routine.blocks[1]!.start).toBe(iso('2026-11-11T07:00'));
    expect(routine.blocks.map((block) => block.rationale)).toEqual([
      'Dois dias para não concentrar.',
      'Dois dias para não concentrar.',
    ]);
  });
});
