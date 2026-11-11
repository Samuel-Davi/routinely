import {
  fixedCommitmentSchema,
  type FixedCommitment,
  type FixedCommitmentInput,
} from '@routinely/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

const listSchema = z.array(fixedCommitmentSchema);

export function useCommitments() {
  return useQuery({
    queryKey: queryKeys.commitments,
    queryFn: ({ signal }) => apiRequest('/fixed-commitments', { schema: listSchema, signal }),
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.commitments }),
      queryClient.invalidateQueries({ queryKey: queryKeys.routines.suggestion }),
    ]);
}

/** Creates when `id` is absent, replaces otherwise. */
export function useSaveCommitment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: FixedCommitmentInput }) =>
      apiRequest(id ? `/fixed-commitments/${id}` : '/fixed-commitments', {
        method: id ? 'PUT' : 'POST',
        body: input,
        schema: fixedCommitmentSchema,
      }),
    onSettled: invalidate,
  });
}

export function useDeleteCommitment() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiRequest(`/fixed-commitments/${id}`, { method: 'DELETE' }),
    // Optimistic removal: the row disappears on the press, and comes back on failure.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.commitments });
      const previous = queryClient.getQueryData<FixedCommitment[]>(queryKeys.commitments);
      queryClient.setQueryData<FixedCommitment[]>(queryKeys.commitments, (current) =>
        current?.filter((commitment) => commitment.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.commitments, context.previous);
    },
    onSettled: invalidate,
  });
}
