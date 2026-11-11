import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api-client';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // Client errors will not fix themselves; only retry transient failures.
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
}

/** Central query key factory: one place to see (and invalidate) server state. */
export const queryKeys = {
  preferences: ['preferences'] as const,
  commitments: ['fixed-commitments'] as const,
  tasks: ['tasks'] as const,
  aiStatus: ['ai-status'] as const,
  auth: {
    me: ['auth', 'me'] as const,
    config: ['auth', 'config'] as const,
  },
  routines: {
    all: ['routines'] as const,
    active: ['routines', 'active'] as const,
    history: ['routines', 'history'] as const,
    detail: (id: string) => ['routines', 'detail', id] as const,
    suggestion: ['routines', 'replan-suggestion'] as const,
  },
};
