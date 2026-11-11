'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { ToastProvider } from '@/components/ui/toast';
import { createQueryClient } from '@/lib/query-client';
import { makeStore } from '@/lib/store/store';

/** Client-side providers: one store and one query cache per browser session. */
export function Providers({ children }: { children: ReactNode }) {
  const [store] = useState(() => makeStore());
  const [queryClient] = useState(createQueryClient);
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </ReduxProvider>
  );
}
