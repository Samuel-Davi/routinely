import {
  activeRoutineSchema,
  placementErrorDetailsSchema,
  replanSuggestionSchema,
  routineBlockSchema,
  routineSchema,
  routineSummarySchema,
  type GenerateRoutineInput,
  type PlacementViolation,
  type Routine,
  type RoutineBlock,
} from '@routinely/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { z } from 'zod';
import { useToast } from '@/components/ui';
import { apiRequest, errorMessage, isApiError } from '@/lib/api-client';
import { VIOLATION_LABEL } from '@/lib/labels';
import { queryKeys } from '@/lib/query-client';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { routineJobSettled, routineJobStarted, selectPendingRoutineId } from '@/lib/store/ui-slice';

const aiStatusSchema = z.object({
  provider: z.string(),
  configured: z.boolean(),
  model: z.string(),
  retryModel: z.string(),
});

/** How often to poll a routine that is still being generated. */
export const ROUTINE_POLL_MS = 1000;

/** The active routine with its blocks; `null` when none was generated yet. */
export function useActiveRoutine() {
  return useQuery({
    queryKey: queryKeys.routines.active,
    queryFn: async ({ signal }) =>
      (await apiRequest('/routines/active', { schema: activeRoutineSchema, signal })).routine,
  });
}

export function useRoutineHistory() {
  return useQuery({
    queryKey: queryKeys.routines.history,
    queryFn: ({ signal }) =>
      apiRequest('/routines', { schema: z.array(routineSummarySchema), signal }),
  });
}

export function useReplanSuggestion() {
  return useQuery({
    queryKey: queryKeys.routines.suggestion,
    queryFn: ({ signal }) =>
      apiRequest('/routines/replan-suggestion', { schema: replanSuggestionSchema, signal }),
    // Blocks become overdue just by time passing, so re-check periodically.
    refetchInterval: 60_000,
  });
}

export function useAiStatus() {
  return useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: ({ signal }) => apiRequest('/ai/status', { schema: aiStatusSchema, signal }),
    staleTime: Infinity,
  });
}

function invalidateRoutineData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.routines.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
  ]);
}

/** Starts a generation or a replan. The server answers at once; the job is polled. */
export function useStartRoutineJob() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  return useMutation({
    mutationFn: (
      request:
        | { kind: 'generate'; input: GenerateRoutineInput }
        | { kind: 'replan'; instruction?: string },
    ) =>
      apiRequest(request.kind === 'generate' ? '/routines/generate' : '/routines/replan', {
        method: 'POST',
        body: request.kind === 'generate' ? request.input : { instruction: request.instruction },
        schema: routineSummarySchema,
      }),
    onSuccess: (routine) => dispatch(routineJobStarted(routine.id)),
    onError: (error) => toast.error(errorMessage(error, 'Não foi possível gerar a rotina.')),
  });
}

/**
 * Follows the routine job the UI is waiting for (its id lives in Redux): polls
 * until it is READY or FAILED, then refreshes everything that depends on it.
 */
export function useRoutineJob(): { pending: boolean } {
  const pendingId = useAppSelector(selectPendingRoutineId);
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const toast = useToast();

  const job = useQuery({
    queryKey: queryKeys.routines.detail(pendingId ?? 'none'),
    queryFn: ({ signal }) =>
      apiRequest(`/routines/${pendingId}`, { schema: routineSchema, signal }),
    enabled: pendingId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' || !query.state.data ? ROUTINE_POLL_MS : false,
  });

  const status = job.data?.status;
  const failed = job.isError;
  useEffect(() => {
    if (pendingId === null) return;
    if (status === 'READY') {
      const routine = job.data as Routine;
      void invalidateRoutineData(queryClient);
      dispatch(routineJobSettled());
      if (routine.source === 'HEURISTIC') toast.info('Rotina gerada sem IA');
      else toast.success(routine.trigger === 'REPLAN' ? 'Rotina replanejada' : 'Rotina gerada');
    } else if (status === 'FAILED' || failed) {
      dispatch(routineJobSettled());
      void invalidateRoutineData(queryClient);
      toast.error(job.data?.notice ?? 'Não foi possível gerar a rotina. Tente novamente.');
    }
    // Reacts to status transitions only; `job.data` is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId, status, failed]);

  return { pending: pendingId !== null };
}

function patchBlock(
  queryClient: QueryClient,
  blockId: string,
  patch: (block: RoutineBlock) => RoutineBlock,
) {
  queryClient.setQueryData<Routine | null>(queryKeys.routines.active, (routine) =>
    routine
      ? {
          ...routine,
          blocks: routine.blocks.map((block) => (block.id === blockId ? patch(block) : block)),
        }
      : routine,
  );
}

/** Shared optimistic-update plumbing for block mutations: apply now, roll back on error. */
function useBlockMutation<TInput extends { blockId: string }>(options: {
  request: (input: TInput) => Promise<RoutineBlock>;
  optimistic: (block: RoutineBlock, input: TInput) => RoutineBlock;
  onError: (error: unknown) => void;
  alsoInvalidateTasks?: boolean;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: options.request,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.routines.active });
      const previous = queryClient.getQueryData<Routine | null>(queryKeys.routines.active);
      patchBlock(queryClient, input.blockId, (block) => options.optimistic(block, input));
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous !== undefined)
        queryClient.setQueryData(queryKeys.routines.active, context.previous);
      options.onError(error);
    },
    onSuccess: (block) => patchBlock(queryClient, block.id, () => block),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.routines.active });
      void queryClient.invalidateQueries({ queryKey: queryKeys.routines.suggestion });
      if (options.alsoInvalidateTasks)
        void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

/** Human-readable reasons from a 409 `BLOCK_CONFLICT` response. */
export function conflictMessage(error: unknown): string {
  if (isApiError(error, 'BLOCK_CONFLICT')) {
    const details = placementErrorDetailsSchema.safeParse(error.details);
    if (details.success && details.data.violations.length > 0)
      return violationMessage(details.data.violations);
  }
  return errorMessage(error, 'Não foi possível mover o bloco.');
}

export const violationMessage = (violations: readonly PlacementViolation[]): string =>
  violations.map((violation) => VIOLATION_LABEL[violation]).join(' · ');

/** Moves/resizes a block. The calendar updates instantly and rolls back on conflict. */
export function useMoveBlock() {
  const toast = useToast();
  return useBlockMutation<{ blockId: string; start: number; end: number }>({
    request: ({ blockId, start, end }) =>
      apiRequest(`/routines/blocks/${blockId}`, {
        method: 'PATCH',
        body: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
        schema: routineBlockSchema,
      }),
    optimistic: (block, { start, end }) => ({
      ...block,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      locked: true,
    }),
    onError: (error) => toast.error(conflictMessage(error)),
  });
}

export function useCompleteBlock() {
  const toast = useToast();
  return useBlockMutation<{ blockId: string; completed: boolean }>({
    request: ({ blockId, completed }) =>
      apiRequest(`/routines/blocks/${blockId}/complete`, {
        method: 'PATCH',
        body: { completed },
        schema: routineBlockSchema,
      }),
    optimistic: (block, { completed }) => ({
      ...block,
      completedAt: completed ? new Date().toISOString() : null,
    }),
    onError: (error) => toast.error(errorMessage(error, 'Não foi possível atualizar o bloco.')),
    alsoInvalidateTasks: true,
  });
}

export function useLockBlock() {
  const toast = useToast();
  return useBlockMutation<{ blockId: string; locked: boolean }>({
    request: ({ blockId, locked }) =>
      apiRequest(`/routines/blocks/${blockId}/lock`, {
        method: 'PATCH',
        body: { locked },
        schema: routineBlockSchema,
      }),
    optimistic: (block, { locked }) => ({ ...block, locked }),
    onError: (error) => toast.error(errorMessage(error, 'Não foi possível atualizar o bloco.')),
  });
}

/** Retries a failed version (same range, new version) and follows the new job. */
export function useRetryRoutine() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/routines/${id}/retry`, { method: 'POST', schema: routineSummarySchema }),
    onSuccess: (routine) => {
      dispatch(routineJobStarted(routine.id));
      return invalidateRoutineData(queryClient);
    },
  });
}

export function useRestoreRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/routines/${id}/restore`, { method: 'POST', schema: routineSchema }),
    onSuccess: (routine) => {
      queryClient.setQueryData(queryKeys.routines.active, routine);
      return invalidateRoutineData(queryClient);
    },
  });
}
