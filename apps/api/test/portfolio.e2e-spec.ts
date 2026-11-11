import type { INestApplication } from '@nestjs/common';
import { fromLocalDateTime, type Routine } from '@routinely/shared';
import request from 'supertest';
import { hashPassword } from '../src/auth/auth.service';
import { LLM_PROVIDER } from '../src/ai/llm-provider';
import { Clock } from '../src/common/clock';
import { APP_CONFIG } from '../src/config/config.module';
import { loadEnv } from '../src/config/env';
import { DemoService } from '../src/demo/demo.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RoutinesService } from '../src/routines/routines.service';
import { TaskEstimationWorker } from '../src/tasks/task-estimation.worker';
import { FakeLlmProvider } from '../src/testing/fake-llm-provider';
import { createTestApp, resetDatabase } from './test-app';

const TZ = 'America/Manaus';
const NOW = new Date(fromLocalDateTime('2026-11-09T06:00', TZ));
const DEMO = { DEMO_EMAIL: 'demo@portfolio.test', DEMO_PASSWORD: 'demo-senha-forte-1' };

describe('Registration toggle (e2e)', () => {
  const states = [
    { enabled: true, status: 201 },
    { enabled: false, status: 403 },
  ];

  for (const { enabled, status } of states) {
    describe(`REGISTRATION_ENABLED=${enabled}`, () => {
      let app: INestApplication;
      let prisma: PrismaService;
      const http = () => request(app.getHttpServer());

      beforeAll(async () => {
        ({ app, prisma } = await createTestApp((builder) =>
          builder
            .overrideProvider(APP_CONFIG)
            .useValue({ ...loadEnv(), REGISTRATION_ENABLED: enabled }),
        ));
        await resetDatabase(prisma);
      });
      afterAll(() => app.close());

      it(`POST /auth/register answers ${status} and the public config says so`, async () => {
        const response = await http()
          .post('/auth/register')
          .send({ email: 'novo@example.com', password: 'cavalo-azul-42' })
          .expect(status);
        const created = await prisma.user.findUnique({ where: { email: 'novo@example.com' } });
        if (enabled) {
          expect(created).not.toBeNull();
        } else {
          expect(created).toBeNull();
          expect(response.body.code).toBe('REGISTRATION_DISABLED');
          // generic: it says nothing about accounts or about why
          expect(response.body.message).toBe('O cadastro está indisponível.');
          expect(response.headers['set-cookie']).toBeUndefined();
          // even an invalid or already-registered payload gets the same answer
          await http().post('/auth/register').send({}).expect(403);
        }
        const config = await http().get('/auth/config').expect(200);
        expect(config.body.registrationEnabled).toBe(enabled);
      });

      it('login keeps working either way', async () => {
        await prisma.user.deleteMany({ where: { email: 'antigo@example.com' } });
        await prisma.user.create({
          data: {
            name: 'Antigo',
            email: 'antigo@example.com',
            passwordHash: await hashPassword('cavalo-azul-42'),
          },
        });
        await http()
          .post('/auth/login')
          .send({ email: 'antigo@example.com', password: 'cavalo-azul-42' })
          .expect(200);
      });
    });
  }

  it('defaults to open in development and closed in production', () => {
    const base = { DATABASE_URL: 'postgresql://u:p@localhost/db' };
    expect(loadEnv({ ...base, NODE_ENV: 'development' }).REGISTRATION_ENABLED).toBe(true);
    const production = { ...base, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) };
    expect(loadEnv(production).REGISTRATION_ENABLED).toBe(false);
    expect(loadEnv({ ...production, REGISTRATION_ENABLED: 'true' }).REGISTRATION_ENABLED).toBe(
      true,
    );
  });
});

describe('Demo account (e2e, mocked LLM)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let enabled = true;
  const llm = new FakeLlmProvider();
  const clock = { now: () => NOW };
  const http = () => request(app.getHttpServer());
  let demoCookie = '';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp((builder) =>
      builder
        .overrideProvider(LLM_PROVIDER)
        .useValue(llm)
        .overrideProvider(Clock)
        .useValue(clock)
        .overrideProvider(APP_CONFIG)
        .useValue({
          ...loadEnv(),
          ...DEMO,
          DEMO_ENABLED: true,
          DEMO_MAX_TASKS: 8,
          DEMO_MAX_COMMITMENTS: 6,
          REGISTRATION_ENABLED: false,
        }),
    ));
    await resetDatabase(prisma);
    llm.configured = true; // the AI is available: the demo must still never call it
  });
  afterAll(() => app.close());

  const asDemo = () => http().get('/tasks').set('Cookie', demoCookie);
  const authed = (method: 'post' | 'patch' | 'delete' | 'get', path: string) =>
    http()[method](path).set('Cookie', demoCookie);

  it('is not offered before the account exists', async () => {
    expect((await http().get('/auth/config').expect(200)).body.demoAvailable).toBe(false);
    await http().post('/auth/demo').expect(404);
  });

  it('is created by the idempotent reset, with realistic data and a generated routine', async () => {
    const first = await app.get(DemoService).reset();
    const second = await app.get(DemoService).reset();
    expect(second.userId).toBe(first.userId);
    expect(await prisma.user.count({ where: { isDemo: true } })).toBe(1);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: first.userId } });
    expect(user.email).toBe(DEMO.DEMO_EMAIL);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(user)).not.toContain(DEMO.DEMO_PASSWORD);

    expect((await http().get('/auth/config').expect(200)).body).toEqual({
      registrationEnabled: false,
      demoAvailable: true,
    });
  });

  it('"Entrar como demo" opens a session flagged as demo, without any password', async () => {
    const response = await http().post('/auth/demo').expect(200);
    expect(response.body).toMatchObject({ email: DEMO.DEMO_EMAIL, isDemo: true });
    demoCookie = (response.headers['set-cookie'] as unknown as string[])
      .map((line) => line.split(';')[0])
      .join('; ');
    const me = await http().get('/auth/me').set('Cookie', demoCookie).expect(200);
    expect(me.body.isDemo).toBe(true);

    const tasks = (await asDemo().expect(200)).body as { estimationSource: string }[];
    expect(tasks).toHaveLength(6);
    expect(tasks.every((task) => task.estimationSource === 'HEURISTIC')).toBe(true);
    expect((await authed('get', '/fixed-commitments').expect(200)).body).toHaveLength(5);
    const active = (await authed('get', '/routines/active').expect(200)).body.routine as Routine;
    expect(active.status).toBe('READY');
    expect(active.source).toBe('HEURISTIC');
    expect(active.blocks.length).toBeGreaterThan(3);
  });

  it('never calls the AI: estimating, generating and replanning all use the heuristic', async () => {
    llm.calls.length = 0;
    llm.clear();
    const created = await authed('post', '/tasks')
      .send({
        title: 'Tarefa nova do visitante',
        description: '',
        priority: 'MEDIUM',
        deadline: new Date(fromLocalDateTime('2026-11-12T20:00', TZ)).toISOString(),
      })
      .expect(201);
    await app.get(TaskEstimationWorker).idle();
    const estimated = (await authed('get', `/tasks/${created.body.id}`).expect(200)).body;
    expect(estimated).toMatchObject({ estimationStatus: 'DONE', estimationSource: 'HEURISTIC' });

    for (const path of ['/routines/generate', '/routines/replan']) {
      const started = await authed('post', path).send({}).expect(202);
      await app.get(RoutinesService).idle();
      const routine = (await authed('get', `/routines/${started.body.id}`).expect(200))
        .body as Routine;
      expect(routine).toMatchObject({ status: 'READY', source: 'HEURISTIC' });
      expect(routine.notice).toContain('Modo demo, sem IA');
    }
    expect(llm.calls).toHaveLength(0);
  });

  it('lets the visitor create, edit, move and complete, but caps what can be written', async () => {
    // 6 seeded + 1 created above = 7; the limit is 8
    await authed('post', '/tasks')
      .send({
        title: 'Mais uma',
        description: '',
        priority: 'LOW',
        deadline: new Date(fromLocalDateTime('2026-11-13T20:00', TZ)).toISOString(),
      })
      .expect(201);
    const blocked = await authed('post', '/tasks')
      .send({
        title: 'Passou do limite',
        description: '',
        priority: 'LOW',
        deadline: new Date(fromLocalDateTime('2026-11-13T20:00', TZ)).toISOString(),
      })
      .expect(403);
    expect(blocked.body.code).toBe('DEMO_LIMIT');
    expect(blocked.body.message).toContain('no máximo 8 tarefas');

    // the same cap for commitments (5 seeded, limit 6)
    const commitment = {
      title: 'Extra',
      daysOfWeek: [6],
      startTime: '14:00',
      endTime: '15:00',
      category: 'OTHER',
      color: 'gray',
    };
    await authed('post', '/fixed-commitments').send(commitment).expect(201);
    await authed('post', '/fixed-commitments').send(commitment).expect(403);

    // everything else is allowed: edit and complete a block
    const active = (await authed('get', '/routines/active').expect(200)).body.routine as Routine;
    const block = active.blocks[0]!;
    await authed('patch', `/routines/blocks/${block.id}/lock`).send({ locked: true }).expect(200);
    await authed('patch', `/routines/blocks/${block.id}/complete`)
      .send({ completed: true })
      .expect(200);
    expect(llm.calls).toHaveLength(0);
  });

  it('goes back to the initial state on reset', async () => {
    await app.get(DemoService).reset();
    expect(((await asDemo().expect(200)).body as unknown[]).length).toBe(6);
    expect((await authed('get', '/fixed-commitments').expect(200)).body).toHaveLength(5);
    const active = (await authed('get', '/routines/active').expect(200)).body.routine as Routine;
    expect(active.blocks.every((block) => block.completedAt === null && !block.locked)).toBe(true);
    // old sessions survive the reset (visitors are not kicked out)
    await http().get('/auth/me').set('Cookie', demoCookie).expect(200);
    // and the writable room is back
    await authed('post', '/tasks')
      .send({
        title: 'Depois do reset',
        description: '',
        priority: 'LOW',
        deadline: new Date(fromLocalDateTime('2026-11-13T20:00', TZ)).toISOString(),
      })
      .expect(201);
    enabled = true;
    expect(enabled).toBe(true);
  });
});

describe('Demo disabled (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    // Account exists in the database but DEMO_ENABLED is off.
    ({ app, prisma } = await createTestApp((builder) =>
      builder.overrideProvider(APP_CONFIG).useValue({ ...loadEnv(), ...DEMO, DEMO_ENABLED: false }),
    ));
    await resetDatabase(prisma);
    await prisma.user.create({
      data: { name: 'Conta demo', email: DEMO.DEMO_EMAIL, isDemo: true },
    });
  });
  afterAll(() => app.close());

  it('hides the button and refuses the endpoint', async () => {
    expect((await http().get('/auth/config').expect(200)).body.demoAvailable).toBe(false);
    await http().post('/auth/demo').expect(404);
  });
});
