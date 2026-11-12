'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { ToastProvider } from '@/components/ui/toast';
import { setSessionExpiredHandler } from '@/lib/api-client';
import { env } from '@/lib/env';
import { leaveForLogin } from '@/lib/session-expiry';
import { createQueryClient } from '@/lib/query-client';
import { makeStore } from '@/lib/store/store';

/** Client-side providers: one store and one query cache per browser session. */
export function Providers({ children }: { children: ReactNode }) {
  const [store] = useState(() => makeStore());
  const [queryClient] = useState(createQueryClient);

  // A request still 401 after a refresh means the session is over: wipe the cache and sign in again.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      queryClient.clear();
      void leaveForLogin({
        logout: () =>
          fetch(`${env.apiUrl}/auth/logout`, { method: 'POST', credentials: 'include' }),
        navigate: (path) => window.location.replace(path),
        now: Date.now,
        storage: safeSessionStorage(),
        pathname: window.location.pathname,
      });
    });
    return () => setSessionExpiredHandler(null);
  }, [queryClient]);
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ReduxProvider>
  );
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
