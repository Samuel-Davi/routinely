import { Logger, type INestApplication } from '@nestjs/common';
import { ApiError } from '@google/genai';
import { fromLocalDateTime } from '@routinely/shared';
import { LLM_PROVIDER } from '../src/ai/llm-provider';
import { GeminiProvider, type GeminiClient } from '../src/ai/providers/gemini.provider';
import { Clock } from '../src/common/clock';
import { APP_CONFIG } from '../src/config/config.module';
import { loadEnv } from '../src/config/env';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RoutinesService } from '../src/routines/routines.service';
import { TaskEstimationWorker } from '../src/tasks/task-estimation.worker';
import { asUser, createTestApp, resetDatabase, type HttpFn } from './test-app';

// A made-up key with the real shape, assembled at runtime so no key-shaped literal is ever
// committed (`pnpm check:secrets` would rightly flag it).
const FAKE_KEY = ['AIza', 'SyD-FAKE-test-key-0123456789abcdefg'].join('');
const TZ = 'America/Manaus';
const at = (local: string) => new Date(fromLocalDateTime(local, TZ));

describe('The Gemini key never leaves the server (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: HttpFn;
  const logged: string[] = [];
  const bodies: string[] = [];

  beforeAll(async () => {
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '));
      });
    }
    // A provider holding the key whose every call fails with an error that *contains* the key,
    // like a vendor echoing the request URL would.
    const client = {
      models: {
        list: async () => {
          throw new ApiError({ status: 503, message: `GET ?key=${FAKE_KEY} failed` });
        },
        generateContent: async () => {
          throw new ApiError({ status: 500, message: `POST ?key=${FAKE_KEY} failed: ${FAKE_KEY}` });
        },
      },
    } as unknown as GeminiClient;
    const provider = new GeminiProvider(
      {
        apiKey: FAKE_KEY,
        model: 'gemini-test',
        retryModel: 'gemini-test',
        timeoutMs: 1000,
        maxOutputTokens: 256,
      },
      client,
    );
    ({ app, prisma } = await createTestApp((builder) =>
      builder
        .overrideProvider(LLM_PROVIDER)
        .useValue(provider)
        .overrideProvider(Clock)
        .useValue({ now: () => at('2026-11-09T06:00') })
        .overrideProvider(APP_CONFIG)
        .useValue({ ...loadEnv(), GEMINI_API_KEY: FAKE_KEY, LLM_MAX_ATTEMPTS: 1 }),
    ));
    http = asUser(app);
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  const record = async (call: ReturnType<ReturnType<HttpFn>['get']>) => {
    const response = await call;
    bodies.push(JSON.stringify({ body: response.body, headers: response.headers }));
    return response;
  };

  it('is absent from every response and every log line, even when the vendor echoes it', async () => {
    await resetDatabase(prisma);
    await record(http().get('/ai/status').expect(200));
    await record(http().get('/preferences').expect(200));

    const created = await record(
      http()
        .post('/tasks')
        .send({
          title: 'Relatório',
          description: '',
          priority: 'HIGH',
          deadline: at('2026-11-12T22:00').toISOString(),
        })
        .expect(201),
    );
    await app.get(TaskEstimationWorker).idle();
    await record(http().get(`/tasks/${created.body.id}`).expect(200));
    const started = await record(http().post('/routines/generate').send({}).expect(202));
    await app.get(RoutinesService).idle();
    await record(http().get(`/routines/${started.body.id}`).expect(200));
    await record(http().get('/routines').expect(200));
    await record(http().get('/does-not-exist').expect(404));
    await record(http().post('/tasks').send({ title: 1 }).expect(400));

    // the failing vendor really was exercised (so the test would have caught a leak)
    expect(logged.join('\n')).toMatch(/estimateTask|generateRoutine|orderRoutine/);
    const everything = [...bodies, ...logged].join('\n');
    expect(everything).not.toContain(FAKE_KEY);
    expect(everything).not.toContain('AIzaSy');
    expect(everything).not.toMatch(/GEMINI_API_KEY/);
    const status = JSON.parse(bodies[0] as string).body;
    expect(Object.keys(status).sort()).toEqual(
      ['configured', 'model', 'modelWarnings', 'provider', 'retryModel'].sort(),
    );
  });
});
