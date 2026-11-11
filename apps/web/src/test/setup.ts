import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './server';

// Node-environment tests (route handlers, proxy) have no DOM to patch.
if (typeof window !== 'undefined') {
  // jsdom has no layout engine: provide the browser APIs components rely on.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.scrollTo ??= (() => undefined) as typeof Element.prototype.scrollTo;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
}

// Unhandled requests fail the test: nothing may reach a real network.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  if (typeof window !== 'undefined') cleanup();
  server.resetHandlers();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
afterAll(() => server.close());
