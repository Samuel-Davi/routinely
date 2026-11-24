import type { INestApplication } from '@nestjs/common';
import { fromLocalDateTime, todaySchema } from '@routinely/shared';
import request from 'supertest';
import { LLM_PROVIDER } from '../src/ai/llm-provider';
import { Clock } from '../src/common/clock';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RoutinesService } from '../src/routines/routines.service';
import { TaskEstimationWorker } from '../src/tasks/task-estimation.worker';
import { FakeLlmProvider } from '../src/testing/fake-llm-provider';
import { accessTokenFor, asUser, createTestApp, resetDatabase, type HttpFn } from './test-app';

const TZ = 'America/Manaus';
const at = (local: string) => new Date(fromLocalDateTime(local, TZ));

describe('Personal tokens and /integrations/today (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ana: HttpFn;
  let anaId: string;
  let biaId: string;
  const llm = new FakeLlmProvider();
  // "Today" comes from this clock, in the user timezone.
  const clock = { now: () => at('2026-11-24T08:00') };

  const raw = () => request(app.getHttpServer());

  beforeAll(async () => {
    llm.configured = false;
    ({ app, prisma } = await createTestApp((builder) =>
      builder.overrideProvider(LLM_PROVIDER).useValue(llm).overrideProvider(Clock).useValue(clock),
    ));
  });
  beforeEach(async () => {
    await app.get(TaskEstimationWorker).idle();
    await app.get(RoutinesService).idle();
    await resetDatabase(prisma);
    anaId = (await prisma.user.create({ data: { name: 'Ana', email: 'ana@example.com' } })).id;
    biaId = (await prisma.user.create({ data: { name: 'Bia', email: 'bia@example.com' } })).id;
    ana = asUser(app, anaId);
  });
  afterAll(() => app.close());

  async function seed(userId: string, title: string) {
    await prisma.fixedCommitment.createMany({
      data: [
        {
          userId,
          title: `${title} semanal`,
          daysOfWeek: [2],
          startTime: '14:00',
          endTime: '16:00',
        },
        {
          userId,
          title: `${title} único`,
          daysOfWeek: [2],
          date: '2026-11-24',
          startTime: '10:00',
          endTime: '11:00',
        },
        {
          userId,
          title: `${title} outro dia`,
          daysOfWeek: [2],
          date: '2026-12-01',
          startTime: '08:00',
          endTime: '09:00',
        },
      ],
    });
    const task = await prisma.task.create({
      data: {
        userId,
        title: `${title} tarefa`,
        description: 'Detalhes longos e privados',
        priority: 'HIGH',
        deadline: at('2026-11-24T18:00'),
      },
    });
    const routine = await prisma.routine.create({
      data: {
        userId,
        version: 1,
        status: 'READY',
        active: true,
        rangeStart: '2026-11-23',
        rangeEnd: '2026-11-29',
        notice: null,
      },
    });
    await prisma.routineBlock.createMany({
      data: [
        {
          userId,
          routineId: routine.id,
          taskId: task.id,
          start: at('2026-11-24T09:00'),
          end: at('2026-11-24T10:00'),
        },
        {
          userId,
          routineId: routine.id,
          taskId: task.id,
          start: at('2026-11-25T09:00'),
          end: at('2026-11-25T10:00'),
        },
      ],
    });
  }

  async function createToken(http: HttpFn = ana): Promise<{ id: string; token: string }> {
    const response = await http().post('/api-tokens').send({ label: 'jarvis' }).expect(201);
    return response.body as { id: string; token: string };
  }

  it('creates a token once, lists it without secrets and reads the day with it', async () => {
    await seed(anaId, 'Ana');
    await seed(biaId, 'Bia');
    const created = await createToken();
    expect(created.token).toMatch(/^rtly_[A-Za-z0-9_-]{43}$/);

    const list = (await ana().get('/api-tokens').expect(200)).body as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('token');
    expect(list[0]).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(list)).not.toContain(created.token.slice(5));
    // Only the hash is stored.
    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.tokenHash).not.toContain(created.token.slice(5));

    const response = await raw()
      .get('/integrations/today')
      .set('Authorization', `Bearer ${created.token}`)
      .expect(200);
    const today = todaySchema.parse(response.body);
    expect(today).toEqual({
      date: '2026-11-24',
      timezone: TZ,
      blocks: [
        {
          start: '09:00',
          end: '10:00',
          title: 'Ana tarefa',
          done: false,
          locked: false,
          priority: 'HIGH',
        },
      ],
      commitments: [
        { start: '10:00', end: '11:00', title: 'Ana único', oneOff: true },
        { start: '14:00', end: '16:00', title: 'Ana semanal', oneOff: false },
      ],
      tasksDue: [{ title: 'Ana tarefa', dueDate: '2026-11-24', priority: 'HIGH', done: false }],
      routineNotice: null,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/Bia|Detalhes/);
  });

  it('reads another date and answers empty lists when there is no routine', async () => {
    const { token } = await createToken();
    const response = await raw()
      .get('/integrations/today?date=2026-12-01')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({
      date: '2026-12-01',
      timezone: TZ,
      blocks: [],
      commitments: [],
      tasksDue: [],
      routineNotice: null,
    });
    await raw()
      .get('/integrations/today?date=2026-02-30')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('refuses the session (cookie or JWT), revoked tokens, and tokens on other routes', async () => {
    const { id, token } = await createToken();
    const session = accessTokenFor(app, anaId);

    await raw().get('/integrations/today').expect(401);
    await raw().get('/integrations/today').set('Cookie', `routinely_at=${session}`).expect(401);
    await raw().get('/integrations/today').set('Authorization', `Bearer ${session}`).expect(401);
    await raw().get('/integrations/today').set('Authorization', 'Bearer rtly_nope').expect(401);
    // A personal token is not a session: it opens nothing else.
    await raw().get('/tasks').set('Authorization', `Bearer ${token}`).expect(401);
    await raw().get('/api-tokens').set('Authorization', `Bearer ${token}`).expect(401);

    await ana().delete(`/api-tokens/${id}`).expect(204);
    const refused = await raw()
      .get('/integrations/today')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(refused.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    // Revoking is per user: Bia cannot touch Ana's token.
    await asUser(app, biaId)().delete(`/api-tokens/${id}`).expect(404);
  });

  it('managing tokens requires a session, and the demo account cannot create them', async () => {
    await raw().post('/api-tokens').send({ label: 'x' }).expect(401);
    await prisma.user.update({ where: { id: anaId }, data: { isDemo: true } });
    await ana().post('/api-tokens').send({ label: 'jarvis' }).expect(403);
  });
});
