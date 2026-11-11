import type { Task } from '@routinely/shared';
import { act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { queryKeys } from '@/lib/query-client';
import { makeTask } from '@/test/fixtures';
import { renderHookWithProviders } from '@/test/render';
import { API, server } from '@/test/server';
import { useDeleteTask, useTasks, useUpdateTask } from './api';

const quietRoutines = [
  http.get(`${API}/routines/replan-suggestion`, () =>
    HttpResponse.json({ needsReplan: false, reasons: [] }),
  ),
  http.get(`${API}/routines/active`, () => HttpResponse.json({ routine: null })),
];

describe('useTasks', () => {
  it('loads tasks and exposes API errors', async () => {
    server.use(http.get(`${API}/tasks`, () => HttpResponse.json([makeTask()])));
    const { result } = renderHookWithProviders(() => useTasks());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);

    server.use(
      http.get(`${API}/tasks`, () =>
        HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
          { status: 500 },
        ),
      ),
    );
    void act(() => void result.current.refetch());
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'INTERNAL_ERROR' }));
  });

  it('polls while an estimate is pending and stops when it is done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pending = makeTask({
      estimationStatus: 'PENDING',
      estimatedMinutes: null,
      complexity: null,
    });
    let calls = 0;
    server.use(
      http.get(`${API}/tasks`, () => {
        calls += 1;
        return HttpResponse.json([
          calls < 3
            ? pending
            : { ...pending, estimationStatus: 'DONE', estimatedMinutes: 60, complexity: 2 },
        ]);
      }),
    );
    const { result } = renderHookWithProviders(() => useTasks());
    await waitFor(() => expect(result.current.data?.[0]?.estimationStatus).toBe('PENDING'));

    await act(() => vi.advanceTimersByTimeAsync(1600));
    await act(() => vi.advanceTimersByTimeAsync(1600));
    await waitFor(() => expect(result.current.data?.[0]?.estimationStatus).toBe('DONE'));
    expect(calls).toBe(3);

    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(calls).toBe(3); // no more polling
    vi.useRealTimers();
  });
});

describe('task mutations', () => {
  it('toggles the status optimistically and rolls back on failure', async () => {
    const task = makeTask();
    let release: () => void = () => undefined;
    server.use(
      http.get(`${API}/tasks`, () => HttpResponse.json([task])),
      ...quietRoutines,
      http.patch(`${API}/tasks/${task.id}`, async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro' },
          { status: 500 },
        );
      }),
    );
    const { result, queryClient } = renderHookWithProviders(() => ({
      tasks: useTasks(),
      update: useUpdateTask(),
    }));
    await waitFor(() => expect(result.current.tasks.isSuccess).toBe(true));

    act(() => result.current.update.mutate({ id: task.id, input: { status: 'DONE' } }));
    await waitFor(() =>
      expect(queryClient.getQueryData<Task[]>(queryKeys.tasks)?.[0]?.status).toBe('DONE'),
    );

    release();
    await waitFor(() => expect(result.current.update.isError).toBe(true));
    expect(queryClient.getQueryData<Task[]>(queryKeys.tasks)?.[0]?.status).toBe('TODO');
  });

  it('removes a task optimistically', async () => {
    const [first, second] = [makeTask({ title: 'A' }), makeTask({ title: 'B' })];
    let remaining = [first, second];
    server.use(
      http.get(`${API}/tasks`, () => HttpResponse.json(remaining)),
      ...quietRoutines,
      http.delete(`${API}/tasks/${first.id}`, () => {
        remaining = [second];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = renderHookWithProviders(() => ({
      tasks: useTasks(),
      remove: useDeleteTask(),
    }));
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(2));
    act(() => result.current.remove.mutate(first.id));
    await waitFor(() =>
      expect(result.current.tasks.data?.map((task) => task.title)).toEqual(['B']),
    );
    await waitFor(() => expect(result.current.remove.isSuccess).toBe(true));
  });
});
