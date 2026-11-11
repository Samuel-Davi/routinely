import { preferencesSchema, type Preferences } from '@routinely/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { env } from '@/lib/env';
import { queryKeys } from '@/lib/query-client';

export function usePreferences() {
  return useQuery({
    queryKey: queryKeys.preferences,
    queryFn: ({ signal }) => apiRequest('/preferences', { schema: preferencesSchema, signal }),
    staleTime: 5 * 60_000,
  });
}

/** The user's timezone, falling back to the configured default until loaded. */
export function useTimezone(): string {
  return usePreferences().data?.timezone ?? env.defaultTimezone;
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Preferences) =>
      apiRequest('/preferences', { method: 'PUT', body: input, schema: preferencesSchema }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.preferences, saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.routines.suggestion });
    },
  });
}
