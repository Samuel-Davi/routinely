import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { createApiTokenSchema, idSchema } from '@routinely/shared';
import { AppModule } from '../app.module';
import { ApiTokensService } from './api-tokens.service';

const USAGE = `Uso:
  pnpm api-token create --email voce@exemplo.com --label jarvis
  pnpm api-token list   --email voce@exemplo.com
  pnpm api-token revoke --email voce@exemplo.com --id <uuid>`;

/**
 * `node dist/api-tokens/api-token.cli.js` (or `pnpm api-token`): manages personal read-only
 * tokens from the terminal. The plain token is printed once, on `create`, and never again.
 */
async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    // pnpm may forward a literal "--" separator: drop it so the flags are still flags.
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    allowPositionals: true,
    options: { email: { type: 'string' }, label: { type: 'string' }, id: { type: 'string' } },
  });
  const [command] = positionals;
  if (!command || !values.email) throw new Error(USAGE);

  // A one-shot process: it must not resume the API's jobs or probe the AI provider.
  process.env.BACKGROUND_JOBS_ENABLED = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const tokens = app.get(ApiTokensService);
    const user = await tokens.userIdForEmail(values.email);
    if (command === 'create') {
      const { label } = createApiTokenSchema.parse({ label: values.label ?? 'jarvis' });
      const created = await tokens.create(user, label);
      console.log(`Token "${created.label}" criado (id ${created.id}, escopo read:today).`);
      console.log('Guarde agora: ele não será mostrado de novo.\n');
      console.log(created.token);
    } else if (command === 'list') {
      for (const token of await tokens.list(user)) {
        const state = token.revokedAt ? 'revogado' : 'ativo';
        console.log(
          `${token.id}  rtly_${token.prefix}…  ${token.label}  ${state}  último uso: ${token.lastUsedAt ?? 'nunca'}`,
        );
      }
    } else if (command === 'revoke') {
      if (!values.id) throw new Error(USAGE);
      await tokens.revoke(user, idSchema.parse(values.id));
      console.log(`Token ${values.id} revogado.`);
    } else {
      throw new Error(USAGE);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'api-token failed');
  process.exit(1);
});
