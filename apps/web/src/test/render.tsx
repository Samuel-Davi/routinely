import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { ToastProvider } from '@/components/ui/toast';
import { makeStore, type AppStore, type RootState } from '@/lib/store/store';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>;
  store?: AppStore;
  queryClient?: QueryClient;
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

function createWrapper(store: AppStore, queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </ReduxProvider>
    );
  };
}

/** Renders with the same providers as the app, isolated per test. */
export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const {
    preloadedState,
    store = makeStore(preloadedState),
    queryClient = createTestQueryClient(),
    ...rest
  } = options;
  return {
    store,
    queryClient,
    ...render(ui, { wrapper: createWrapper(store, queryClient), ...rest }),
  };
}

export function renderHookWithProviders<TResult>(hook: () => TResult, options: Options = {}) {
  const {
    preloadedState,
    store = makeStore(preloadedState),
    queryClient = createTestQueryClient(),
  } = options;
  return {
    store,
    queryClient,
    ...renderHook(hook, { wrapper: createWrapper(store, queryClient) }),
  };
}
