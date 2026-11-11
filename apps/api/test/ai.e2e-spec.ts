import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LLM_PROVIDER, LlmError } from '../src/ai/llm-provider';
import type { PrismaService } from '../src/prisma/prisma.service';
import { TaskEstimationWorker } from '../src/tasks/task-estimation.worker';
import { FakeLlmProvider } from '../src/testing/fake-llm-provider';
import { createTestApp, resetDatabase } from './test-app';

const task = {
  title: 'Estudar para a prova',
  description: 'Capítulos 4 a 6',
  priority: 'HIGH',
  deadline: '2030-01-10T22:00:00.000Z',
};
const answer = {
  complexity: 4,
  estimatedMinutes: 230,
  splittable: true,
  rationale: 'Conteúdo denso.',
};

describe('AI estimation (e2e, mocked LLM)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let worker: TaskEstimationWorker;
  const llm = new FakeLlmProvider();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder.overrideProvider(LLM_PROVIDER).useValue(llm),
    ));
    worker = app.get(TaskEstimationWorker);
  });
  beforeEach(async () => {
    await worker.idle();
    await resetDatabase(prisma);
    llm.calls.length = 0;
    llm.configured = true;
  });
  afterAll(() => app.close());

  it('reports the active provider without exposing secrets', async () => {
    const response = await http().get('/ai/status').expect(200);
    expect(response.body).toEqual({
      provider: 'fake',
      configured: true,
      model: 'fake-default',
      retryModel: 'fake-retry',
    });
  });

  it('estimates a new task asynchronously and exposes the job state', async () => {
    llm.reply(answer);
    const created = await http().post('/tasks').send(task).expect(201);
    expect(created.body.estimationStatus).toBe('PENDING');

    await worker.idle();
    const estimated = await http().get(`/tasks/${created.body.id}`).expect(200);
    expect(estimated.body).toMatchObject({
      complexity: 4,
      estimatedMinutes: 240, // rounded up to the 15 minute grid
      splittable: true,
      aiRationale: 'Conteúdo denso.',
      estimationStatus: 'DONE',
      estimationSource: 'AI',
    });
  });

  it('reuses the cached estimate for an identical task', async () => {
    llm.reply(answer);
    await http().post('/tasks').send(task).expect(201);
    await worker.idle();
    const second = await http()
      .post('/tasks')
      .send({ ...task, deadline: '2030-02-01T12:00:00.000Z' });
    await worker.idle();

    expect(llm.calls).toHaveLength(1);
    const estimated = await http().get(`/tasks/${second.body.id}`).expect(200);
    expect(estimated.body).toMatchObject({ estimatedMinutes: 240, estimationSource: 'AI' });
  });

  it('retries once on invalid output, then succeeds', async () => {
    llm.reply({ ...answer, complexity: 42 }, answer);
    const created = await http().post('/tasks').send(task).expect(201);
    await worker.idle();
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1]?.tier).toBe('retry');
    const estimated = await http().get(`/tasks/${created.body.id}`).expect(200);
    expect(estimated.body.estimationSource).toBe('AI');
  });

  it('falls back to a heuristic estimate when the provider keeps rate limiting', async () => {
    llm.reply(...Array.from({ length: 3 }, () => new LlmError('RATE_LIMIT', '429')));
    const created = await http().post('/tasks').send(task).expect(201);
    await worker.idle();
    expect(llm.calls).toHaveLength(3);
    const estimated = await http().get(`/tasks/${created.body.id}`).expect(200);
    expect(estimated.body).toMatchObject({
      estimationStatus: 'DONE',
      estimationSource: 'HEURISTIC',
    });
    expect(estimated.body.estimatedMinutes).toBeGreaterThan(0);
  });

  it('re-estimates after an edit, but never over a manual override', async () => {
    llm.reply(answer, { ...answer, estimatedMinutes: 60, rationale: 'Mais simples.' });
    const created = await http().post('/tasks').send(task).expect(201);
    await worker.idle();

    await http()
      .patch(`/tasks/${created.body.id}`)
      .send({ title: 'Revisar anotações' })
      .expect(200);
    await worker.idle();
    const edited = await http().get(`/tasks/${created.body.id}`).expect(200);
    expect(edited.body).toMatchObject({ estimatedMinutes: 60, aiRationale: 'Mais simples.' });

    await http()
      .patch(`/tasks/${created.body.id}`)
      .send({ estimate: { complexity: 1, estimatedMinutes: 30, splittable: false } })
      .expect(200);
    await http().patch(`/tasks/${created.body.id}`).send({ title: 'Outro título' }).expect(200);
    await worker.idle();
    const overridden = await http().get(`/tasks/${created.body.id}`).expect(200);
    expect(overridden.body).toMatchObject({ estimatedMinutes: 30, estimationSource: 'MANUAL' });
    expect(llm.calls).toHaveLength(2);
  });

  it('re-estimates on demand', async () => {
    llm.reply(answer);
    const created = await http().post('/tasks').send(task).expect(201);
    await worker.idle();
    await http()
      .patch(`/tasks/${created.body.id}`)
      .send({ estimate: { complexity: 1, estimatedMinutes: 30, splittable: false } })
      .expect(200);

    const response = await http().post(`/tasks/${created.body.id}/estimate`).expect(202);
    expect(response.body.estimationStatus).toBe('PENDING');
    await worker.idle();
    const estimated = await http().get(`/tasks/${created.body.id}`).expect(200);
    // identical content → served from the estimate cache
    expect(estimated.body).toMatchObject({ estimatedMinutes: 240, estimationSource: 'AI' });
  });
});
