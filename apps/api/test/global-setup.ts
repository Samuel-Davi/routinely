import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { TEST_DATABASE_URL } from './test-env';

/** Creates (if needed) and migrates the e2e database once per run. */
export default function globalSetup(): void {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
