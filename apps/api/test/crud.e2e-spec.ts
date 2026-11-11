import type { INestApplication } from '@nestjs/common';
import { DEFAULT_PREFERENCES } from '@routinely/shared';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetDatabase } from './test-app';

describe('CRUD endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(() => resetDatabase(prisma));
  afterAll(() => app.close());

  describe('GET /health', () => {
    it('reports the API and database as up', async () => {
      const response = await http().get('/health').expect(200);
      expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
    });
  });

  describe('/fixed-commitments', () => {
    const commitment = {
      title: 'Aula de inglês',
      daysOfWeek: [2, 4],
      startTime: '19:00',
      endTime: '20:30',
      category: 'STUDY',
      color: 'purple',
    };

    it('creates, lists, updates and deletes a commitment', async () => {
      const created = await http().post('/fixed-commitments').send(commitment).expect(201);
      expect(created.body).toMatchObject(commitment);
      const id: string = created.body.id;

      const list = await http().get('/fixed-commitments').expect(200);
      expect(list.body).toHaveLength(1);

      const updated = await http()
        .put(`/fixed-commitments/${id}`)
        .send({ ...commitment, title: 'Inglês', daysOfWeek: [1] })
        .expect(200);
      expect(updated.body).toMatchObject({ title: 'Inglês', daysOfWeek: [1] });

      await http().delete(`/fixed-commitments/${id}`).expect(204);
      await http().get(`/fixed-commitments/${id}`).expect(404);
    });

    it('rejects invalid payloads with the shared error shape', async () => {
      const response = await http()
        .post('/fixed-commitments')
        .send({ ...commitment, endTime: '18:00', daysOfWeek: [] })
        .expect(400);
      expect(response.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
      expect(response.body.details.map((issue: { path: string }) => issue.path)).toEqual(
        expect.arrayContaining(['daysOfWeek', 'endTime']),
      );
    });

    it('returns 400 for a malformed id and 404 for an unknown one', async () => {
      await http().get('/fixed-commitments/not-a-uuid').expect(400);
      const response = await http()
        .get('/fixed-commitments/6f1c2d3e-4b5a-4c6d-8e7f-901234567890')
        .expect(404);
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('bumps the schedule change marker used by the replan suggestion', async () => {
      const before = await prisma.user.findFirstOrThrow();
      await http().post('/fixed-commitments').send(commitment).expect(201);
      const after = await prisma.user.findFirstOrThrow();
      expect(after.scheduleChangedAt.getTime()).toBeGreaterThan(before.scheduleChangedAt.getTime());
    });
  });

  describe('/tasks', () => {
    const task = {
      title: 'Preparar apresentação',
      description: 'Slides para o cliente',
      priority: 'HIGH',
      deadline: '2030-01-10T22:00:00.000Z',
    };

    it('creates a task with a pending estimate', async () => {
      const response = await http().post('/tasks').send(task).expect(201);
      expect(response.body).toMatchObject({ ...task, status: 'TODO', complexity: null });
      expect(['PENDING', 'DONE']).toContain(response.body.estimationStatus);
    });

    it('lists tasks ordered by deadline and filters by status', async () => {
      await http()
        .post('/tasks')
        .send({ ...task, title: 'Depois', deadline: '2030-02-01T12:00:00.000Z' });
      const first = await http()
        .post('/tasks')
        .send({ ...task, title: 'Antes' });
      await http().patch(`/tasks/${first.body.id}`).send({ status: 'DONE' }).expect(200);

      const all = await http().get('/tasks').expect(200);
      expect(all.body.map((item: { title: string }) => item.title)).toEqual(['Antes', 'Depois']);

      const done = await http().get('/tasks?status=DONE').expect(200);
      expect(done.body).toHaveLength(1);
      await http().get('/tasks?status=NOPE').expect(400);
    });

    it('applies a manual estimate override', async () => {
      const created = await http().post('/tasks').send(task).expect(201);
      const response = await http()
        .patch(`/tasks/${created.body.id}`)
        .send({ estimate: { complexity: 4, estimatedMinutes: 120, splittable: true } })
        .expect(200);
      expect(response.body).toMatchObject({
        complexity: 4,
        estimatedMinutes: 120,
        splittable: true,
        estimationStatus: 'DONE',
        estimationSource: 'MANUAL',
      });
    });

    it('rejects an empty patch and an off-grid estimate', async () => {
      const created = await http().post('/tasks').send(task).expect(201);
      await http().patch(`/tasks/${created.body.id}`).send({}).expect(400);
      await http()
        .patch(`/tasks/${created.body.id}`)
        .send({ estimate: { complexity: 4, estimatedMinutes: 50, splittable: true } })
        .expect(400);
    });

    it('deletes a task', async () => {
      const created = await http().post('/tasks').send(task).expect(201);
      await http().delete(`/tasks/${created.body.id}`).expect(204);
      await http().get(`/tasks/${created.body.id}`).expect(404);
    });
  });

  describe('/preferences', () => {
    it('returns defaults, then the saved values', async () => {
      const initial = await http().get('/preferences').expect(200);
      expect(initial.body).toEqual(DEFAULT_PREFERENCES);

      const next = { ...DEFAULT_PREFERENCES, dayStart: '06:00', maxFocusBlockMinutes: 60 };
      await http().put('/preferences').send(next).expect(200);
      const saved = await http().get('/preferences').expect(200);
      expect(saved.body).toEqual(next);
    });

    it('rejects an inverted day window', async () => {
      await http()
        .put('/preferences')
        .send({ ...DEFAULT_PREFERENCES, dayStart: '23:00', dayEnd: '06:00' })
        .expect(400);
    });
  });

  describe('docs', () => {
    it('serves the OpenAPI document', async () => {
      const response = await http().get('/docs-json').expect(200);
      expect(Object.keys(response.body.paths)).toEqual(
        expect.arrayContaining(['/tasks', '/fixed-commitments', '/preferences', '/health']),
      );
    });
  });
});
