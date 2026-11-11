import { taskSchema } from '@routinely/shared';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { API, server } from '@/test/server';
import {
  ApiRequestError,
  apiRequest,
  errorMessage,
  isApiError,
  setSessionExpiredHandler,
} from './api-client';

const task = {
  id: '6f1c2d3e-4b5a-4c6d-8e7f-901234567890',
  title: 'Relatório',
  description: '',
  priority: 'HIGH',
  deadline: '2026-11-13T22:00:00.000Z',
  commitmentId: null,
  status: 'TODO',
  complexity: null,
  estimatedMinutes: null,
  splittable: null,
  aiRationale: null,
  estimationStatus: 'PENDING',
  estimationSource: null,
  createdAt: '2026-11-10T12:00:00.000Z',
  updatedAt: '2026-11-10T12:00:00.000Z',
};

describe('apiRequest', () => {
  it('returns the response validated by the schema', async () => {
    server.use(http.get(`${API}/tasks`, () => HttpResponse.json([task])));
    const tasks = await apiRequest('/tasks', { schema: z.array(taskSchema) });
    expect(tasks[0]?.title).toBe('Relatório');
  });

  it('sends JSON bodies', async () => {
    let received: unknown;
    let contentType: string | null = null;
    server.use(
      http.post(`${API}/tasks`, async ({ request }) => {
        received = await request.json();
        contentType = request.headers.get('content-type');
        return HttpResponse.json(task, { status: 201 });
      }),
    );
    await apiRequest('/tasks', {
      method: 'POST',
      body: { title: 'Relatório' },
      schema: taskSchema,
    });
    expect(received).toEqual({ title: 'Relatório' });
    expect(contentType).toBe('application/json');
  });

  it('resolves to undefined when no schema is given (204)', async () => {
    server.use(http.delete(`${API}/tasks/1`, () => new HttpResponse(null, { status: 204 })));
    await expect(apiRequest('/tasks/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws the typed API error', async () => {
    server.use(
      http.patch(`${API}/routines/blocks/1`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'BLOCK_CONFLICT',
            message: 'Conflito',
            details: { violations: ['OVERLAPS_BLOCK'] },
          },
          { status: 409 },
        ),
      ),
    );
    const error = await apiRequest('/routines/blocks/1', { method: 'PATCH', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(isApiError(error, 'BLOCK_CONFLICT')).toBe(true);
    expect(isApiError(error, 'NOT_FOUND')).toBe(false);
    expect(error).toMatchObject({
      status: 409,
      message: 'Conflito',
      details: { violations: ['OVERLAPS_BLOCK'] },
    });
  });

  it('normalises non-JSON error bodies', async () => {
    server.use(
      http.get(`${API}/tasks`, () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })),
    );
    await expect(apiRequest('/tasks')).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR' });
  });

  it('reports network failures in Portuguese', async () => {
    server.use(http.get(`${API}/tasks`, () => HttpResponse.error()));
    const error = await apiRequest('/tasks').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
    expect(errorMessage(error)).toContain('conectar ao servidor');
  });

  it('rejects a response that does not match the schema', async () => {
    server.use(http.get(`${API}/tasks`, () => HttpResponse.json([{ ...task, priority: 'ASAP' }])));
    await expect(apiRequest('/tasks', { schema: z.array(taskSchema) })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('lets aborts through untouched', async () => {
    server.use(http.get(`${API}/tasks`, () => HttpResponse.json([])));
    const controller = new AbortController();
    controller.abort();
    await expect(apiRequest('/tasks', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(errorMessage(new Error('boom'))).toBe('Algo deu errado. Tente novamente.');
    expect(errorMessage('x', 'Falhou')).toBe('Falhou');
  });
});

describe('apiRequest: expired session', () => {
  const unauthenticated = () =>
    HttpResponse.json(
      { statusCode: 401, code: 'UNAUTHENTICATED', message: 'Faça login para continuar.' },
      { status: 401 },
    );
  afterEach(() => setSessionExpiredHandler(null));

  it('refreshes the session once and replays the request that was refused', async () => {
    let calls = 0;
    let refreshes = 0;
    server.use(
      http.get(`${API}/tasks`, () =>
        ++calls === 1 ? unauthenticated() : HttpResponse.json([task]),
      ),
      http.post(`${API}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ id: task.id, email: 'a@b.co', name: 'A', isDemo: false });
      }),
    );
    const tasks = await apiRequest('/tasks', { schema: z.array(taskSchema) });
    expect(tasks).toHaveLength(1);
    expect(calls).toBe(2);
    expect(refreshes).toBe(1);
  });

  it('shares one refresh between parallel requests (the refresh token can be used once)', async () => {
    const seen = new Set<string>();
    let refreshes = 0;
    server.use(
      http.get(`${API}/tasks`, ({ request }) => {
        const key = request.headers.get('x-test') ?? '';
        if (!seen.has(key)) {
          seen.add(key);
          return unauthenticated();
        }
        return HttpResponse.json([]);
      }),
      http.post(`${API}/auth/refresh`, async () => {
        refreshes += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return HttpResponse.json({ id: task.id, email: 'a@b.co', name: 'A', isDemo: false });
      }),
    );
    // three requests are refused at the same time: they must trigger a single refresh
    seen.clear();
    server.use(http.get(`${API}/preferences`, () => unauthenticated()));
    await Promise.allSettled([
      apiRequest('/preferences'),
      apiRequest('/preferences'),
      apiRequest('/preferences'),
    ]);
    expect(refreshes).toBe(1);
  });

  it('leaves for the login screen when the refresh fails, and surfaces the 401', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    server.use(
      http.get(`${API}/tasks`, () => unauthenticated()),
      http.post(`${API}/auth/refresh`, () => unauthenticated()),
    );
    await expect(apiRequest('/tasks')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not try to refresh on auth routes: a wrong password is not an expired session', async () => {
    let refreshes = 0;
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 401, code: 'UNAUTHENTICATED', message: 'E-mail ou senha incorretos.' },
          { status: 401 },
        ),
      ),
      http.post(`${API}/auth/refresh`, () => {
        refreshes += 1;
        return unauthenticated();
      }),
    );
    await expect(
      apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'x' } }),
    ).rejects.toMatchObject({ message: 'E-mail ou senha incorretos.' });
    expect(refreshes).toBe(0);
    expect(expired).not.toHaveBeenCalled();
  });
});
