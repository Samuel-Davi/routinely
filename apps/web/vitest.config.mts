import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // Test against the shared source so no build step is needed.
      '@routinely/shared': path.resolve(import.meta.dirname, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // `pnpm -r test` runs three suites at once: cap the workers so a busy machine does not time
    // out while starting them ("Timeout waiting for worker to respond").
    maxWorkers: 4,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    env: {
      NEXT_PUBLIC_API_URL: 'http://api.test',
      NEXT_PUBLIC_DEFAULT_TIMEZONE: 'America/Manaus',
    },
  },
});
