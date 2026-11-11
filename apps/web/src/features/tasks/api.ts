import {
  taskSchema,
  type CreateTaskInput,
  type Task,
  type UpdateTaskInput,
} from '@routinely/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

const listSchema = z.array(taskSchema);

/** How often to poll while the AI is still estimating a task. */
export const ESTIMATION_POLL_MS = 1500;

export function useTasks() {
  return useQuery({
    queryKey: queryKeys.tasks,
    queryFn: ({ signal }) => apiRequest('/tasks', { schema: listSchema, signal }),
    // The estimate is an async job on the server: poll only while one is pending.
    refetchInterval: (query) =>
      query.state.data?.some((task) => task.estimationStatus === 'PENDING')
        ? ESTIMATION_POLL_MS
        : false,
  });
}

function upsert(queryClient: QueryClient, task: Task) {
  queryClient.setQueryData<Task[]>(queryKeys.tasks, (current) => {
    if (!current) return current;
    const exists = current.some((item) => item.id === task.id);
    const next = exists
      ? current.map((item) => (item.id === task.id ? task : item))
      : [...current, task];
    return next.sort((a, b) => a.deadline.localeCompare(b.deadline));
  });
}

function invalidateRelated(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
    queryClient.invalidateQueries({ queryKey: queryKeys.routines.suggestion }),
    queryClient.invalidateQueries({ queryKey: queryKeys.routines.active }),
  ]);
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiRequest('/tasks', { method: 'POST', body: input, schema: taskSchema }),
    onSuccess: (task) => upsert(queryClient, task),
    onSettled: () => invalidateRelated(queryClient),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      apiRequest(`/tasks/${id}`, { method: 'PATCH', body: input, schema: taskSchema }),
    // Optimistic status toggle (the checkbox must answer instantly), with rollback.
    onMutate: async ({ id, input }) => {
      if (input.status === undefined) return undefined;
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks });
      const previous = queryClient.getQueryData<Task[]>(queryKeys.tasks);
      queryClient.setQueryData<Task[]>(queryKeys.tasks, (current) =>
        current?.map((task) =>
          task.id === id ? { ...task, status: input.status ?? task.status } : task,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.tasks, context.previous);
    },
    onSuccess: (task) => upsert(queryClient, task),
    onSettled: () => invalidateRelated(queryClient),
  });
}

export function useReestimateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/tasks/${id}/estimate`, { method: 'POST', schema: taskSchema }),
    onSuccess: (task) => upsert(queryClient, task),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/tasks/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks });
      const previous = queryClient.getQueryData<Task[]>(queryKeys.tasks);
      queryClient.setQueryData<Task[]>(queryKeys.tasks, (current) =>
        current?.filter((task) => task.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.tasks, context.previous);
    },
    onSettled: () => invalidateRelated(queryClient),
  });
}
