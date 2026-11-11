import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DemoService } from './demo.service';

/**
 * `node dist/demo/demo.cli.js` (or `pnpm demo:reset`): creates/resets the demo account.
 * Safe to run from cron: it never resumes jobs of the running API or calls the AI.
 */
async function main(): Promise<void> {
  // This process only resets data: it must not resume the API's jobs or probe the AI provider.
  process.env.BACKGROUND_JOBS_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const result = await app.get(DemoService).reset();
    console.log(
      `Demo reset: ${result.tasks} tarefas, ${result.commitments} compromissos e rotina gerada.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'demo reset failed');
  process.exit(1);
});
