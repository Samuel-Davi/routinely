import type { INestApplication } from '@nestjs/common';
import { fromLocalDateTime, type Routine } from '@routinely/shared';
import { LLM_PROVIDER } from '../src/ai/llm-provider';
import { Clock } from '../src/common/clock';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RoutinesService } from '../src/routines/routines.service';
import { TaskEstimationWorker } from '../src/tasks/task-estimation.worker';
import { FakeLlmProvider } from '../src/testing/fake-llm-provider';
import { asUser, createTestApp, resetDatabase, type HttpFn } from './test-app';

const TZ = 'America/Manaus';
const iso = (local: string) => new Date(fromLocalDateTime(local, TZ)).toISOString();
const UNKNOWN = '00000000-0000-4000-8000-0000000000ff';

describe('Isolation between users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ana: HttpFn;
  let bia: HttpFn;
  let anaId: string;
  let biaId: string;
  const llm = new FakeLlmProvider();
  const clock = { now: () => new Date(fromLocalDateTime('2026-11-09T06:00', TZ)) };

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
    bia = asUser(app, biaId);
  });
  afterAll(() => app.close());

  async function seedAna() {
    const commitment = (
      await ana()
        .post('/fixed-commitments')
        .send({
          title: 'Trabalho',
          daysOfWeek: [1, 2, 3, 4, 5],
          startTime: '08:00',
          endTime: '12:00',
          category: 'WORK',
          color: 'blue',
        })
        .expect(201)
    ).body;
    const task = (
      await ana()
        .post('/tasks')
        .send({
          title: 'Relatório da Ana',
          description: '',
          priority: 'HIGH',
          deadline: iso('2026-11-12T22:00'),
          commitmentId: commitment.id,
        })
        .expect(201)
    ).body;
    await app.get(TaskEstimationWorker).idle();
    await ana()
      .patch(`/tasks/${task.id}`)
      .send({ estimate: { complexity: 3, estimatedMinutes: 60, splittable: true } })
      .expect(200);
    const started = (await ana().post('/routines/generate').send({}).expect(202)).body;
    await app.get(RoutinesService).idle();
    const routine = (await ana().get(`/routines/${started.id}`).expect(200)).body as Routine;
    return { commitment, task, routine };
  }

  it('lists nothing of another user and ignores a userId sent in the body', async () => {
    const { task, commitment } = await seedAna();
    expect((await bia().get('/tasks').expect(200)).body).toEqual([]);
    expect((await bia().get('/fixed-commitments').expect(200)).body).toEqual([]);
    expect((await bia().get('/routines').expect(200)).body).toEqual([]);
    expect((await bia().get('/routines/active').expect(200)).body.routine).toBeNull();
    expect((await ana().get('/tasks').expect(200)).body).toHaveLength(1);

    // The owner always comes from the token: a forged userId in the body is dropped.
    const forged = await bia()
      .post('/tasks')
      .send({
        title: 'Minha',
        description: '',
        priority: 'LOW',
        deadline: iso('2026-11-13T22:00'),
        userId: anaId,
      })
      .expect(201);
    const row = await prisma.task.findUniqueOrThrow({ where: { id: forged.body.id } });
    expect(row.userId).toBe(biaId);
    expect((await ana().get('/tasks').expect(200)).body.map((t: { id: string }) => t.id)).toEqual([
      task.id,
    ]);
    expect(commitment.id).toBeTruthy();
  });

  it('answers 404 (not 403) for every id of another user, on every verb', async () => {
    const { task, commitment, routine } = await seedAna();
    const block = routine.blocks[0]!;

    await bia().get(`/tasks/${task.id}`).expect(404);
    await bia().patch(`/tasks/${task.id}`).send({ title: 'hack' }).expect(404);
    await bia().post(`/tasks/${task.id}/reestimate`).expect(404);
    await bia().delete(`/tasks/${task.id}`).expect(404);

    await bia()
      .patch(`/fixed-commitments/${commitment.id}`)
      .send({ ...commitment })
      .expect(404);
    await bia().delete(`/fixed-commitments/${commitment.id}`).expect(404);

    await bia().get(`/routines/${routine.id}`).expect(404);
    await bia().post(`/routines/${routine.id}/restore`).expect(404);
    await bia().post(`/routines/${routine.id}/retry`).expect(404);
    await bia()
      .patch(`/routines/blocks/${block.id}`)
      .send({ start: block.start, end: block.end })
      .expect(404);
    await bia().patch(`/routines/blocks/${block.id}/lock`).send({ locked: true }).expect(404);
    await bia()
      .patch(`/routines/blocks/${block.id}/complete`)
      .send({ completed: true })
      .expect(404);

    // nothing of Ana's changed
    const intact = (await ana().get(`/tasks/${task.id}`).expect(200)).body;
    expect(intact.title).toBe('Relatório da Ana');
    expect((await ana().get(`/routines/${routine.id}`).expect(200)).body.blocks[0].locked).toBe(
      false,
    );
    await ana().get(`/tasks/${UNKNOWN}`).expect(404);
  });

  it("does not let a task point at, or be filtered by, another user's commitment", async () => {
    const { commitment } = await seedAna();
    await bia()
      .post('/tasks')
      .send({
        title: 'x',
        description: '',
        priority: 'LOW',
        deadline: iso('2026-11-13T22:00'),
        commitmentId: commitment.id,
      })
      .expect(404);
    expect((await bia().get(`/tasks?commitmentId=${commitment.id}`).expect(200)).body).toEqual([]);
  });

  it('keeps preferences, schedule markers and generated routines separate', async () => {
    await seedAna();
    await ana()
      .put('/preferences')
      .send({ ...(await ana().get('/preferences').expect(200)).body, maxFocusBlockMinutes: 45 })
      .expect(200);
    expect((await bia().get('/preferences').expect(200)).body.maxFocusBlockMinutes).toBe(90);

    // Bia plans her own (empty) week: Ana's task never appears in it.
    const started = (await bia().post('/routines/generate').send({}).expect(202)).body;
    await app.get(RoutinesService).idle();
    const mine = (await bia().get(`/routines/${started.id}`).expect(200)).body as Routine;
    expect(mine.status).toBe('READY');
    expect(mine.blocks).toEqual([]);
    expect(mine.version).toBe(1);
    expect((await ana().get('/routines').expect(200)).body).toHaveLength(1);
  });

  it('blocks edits while the same user generates, but not other users', async () => {
    const { routine } = await seedAna();
    const block = routine.blocks[0]!;
    // Bia has a pending generation: it must not lock Ana's edits.
    await prisma.routine.create({
      data: {
        userId: biaId,
        version: 1,
        status: 'PENDING',
        rangeStart: '2026-11-09',
        rangeEnd: '2026-11-15',
      },
    });
    await ana().patch(`/routines/blocks/${block.id}/lock`).send({ locked: true }).expect(200);
  });

  it("resumes interrupted jobs for the right user, using that user's data", async () => {
    const { task } = await seedAna();
    const orphan = await prisma.routine.create({
      data: {
        userId: anaId,
        version: 2,
        status: 'PENDING',
        rangeStart: '2026-11-09',
        rangeEnd: '2026-11-15',
      },
    });
    await app.get(RoutinesService).onApplicationBootstrap();
    await app.get(RoutinesService).idle();
    const resumed = (await ana().get(`/routines/${orphan.id}`).expect(200)).body as Routine;
    expect(resumed.status).toBe('READY');
    expect(resumed.blocks.every((b) => b.taskId === task.id)).toBe(true);
    expect((await bia().get('/routines').expect(200)).body).toEqual([]);
  });
});
