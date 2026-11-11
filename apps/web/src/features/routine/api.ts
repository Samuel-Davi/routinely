import { activeRoutineSchema } from '@routinely/shared';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

/** The active routine with its blocks; `null` when none was generated yet. */
export function useActiveRoutine() {
  return useQuery({
    queryKey: queryKeys.routines.active,
    queryFn: async ({ signal }) =>
      (await apiRequest('/routines/active', { schema: activeRoutineSchema, signal })).routine,
  });
}
