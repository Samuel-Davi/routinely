'use client';

import {
  authConfigSchema,
  authUserSchema,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from '@routinely/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

/** What the login screen may offer (signup open? demo available?). Public endpoint. */
export function useAuthConfig() {
  return useQuery({
    queryKey: queryKeys.auth.config,
    queryFn: ({ signal }) => apiRequest('/auth/config', { schema: authConfigSchema, signal }),
    staleTime: 60_000,
  });
}

/** The signed-in user (server state: TanStack Query, never copied into Redux). */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: ({ signal }) => apiRequest('/auth/me', { schema: authUserSchema, signal }),
    // A 401 is handled by the client (refresh, then login); do not retry it here.
    retry: false,
    staleTime: 5 * 60_000,
  });
}

/** Only same-site paths: `?next=` must never become an open redirect. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? next
    : '/';
}

function useStartSession(next: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  return (user: AuthUser) => {
    // A new session must not see the previous user's cached data.
    queryClient.clear();
    queryClient.setQueryData(queryKeys.auth.me, user);
    router.replace(safeNext(next));
    router.refresh();
  };
}

export function useLogin(next = '/') {
  const start = useStartSession(next);
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiRequest('/auth/login', { method: 'POST', body: input, schema: authUserSchema }),
    onSuccess: start,
  });
}

export function useRegister(next = '/') {
  const start = useStartSession(next);
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiRequest('/auth/register', { method: 'POST', body: input, schema: authUserSchema }),
    onSuccess: start,
  });
}

export function useDemoLogin(next = '/') {
  const start = useStartSession(next);
  return useMutation({
    mutationFn: () => apiRequest('/auth/demo', { method: 'POST', schema: authUserSchema }),
    onSuccess: start,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => apiRequest('/auth/logout', { method: 'POST' }),
    // Whatever the server says, this browser is done: drop the cache and leave.
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
      router.refresh();
    },
  });
}
