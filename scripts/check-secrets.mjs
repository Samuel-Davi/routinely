// Fails if a secret could have leaked into something that ships to browsers or into git.
//
//   pnpm check:secrets        (run after `pnpm build`; also part of CI)
//
// It looks for (1) any Google API key shaped string and (2) the real values of the secrets
// configured in .env / the environment (GEMINI_API_KEY, JWT_SECRET, DEMO_PASSWORD, ...), in the
// web bundle, the API build output and every git-tracked text file. Values are never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const GOOGLE_KEY = /AIza[0-9A-Za-z_-]{35}/;
const SECRET_NAMES = [
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'JWT_SECRET',
  'DEMO_PASSWORD',
  'POSTGRES_PASSWORD',
];

function envFileValues() {
  const values = {};
  const file = join(root, '.env');
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const configured = { ...envFileValues(), ...process.env };
// Short values (e.g. the default dev DB password) would match everything; only real secrets count.
const secrets = SECRET_NAMES.map((name) => [name, configured[name]]).filter(
  ([name, value]) => value && value.length >= 16 && name !== 'POSTGRES_PASSWORD',
);

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) yield* walk(path);
    else if (stats.size < 8_000_000) yield path;
  }
}

const trackedFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter(
    (file) => !/\.(png|jpe?g|gif|webp|ico|woff2?|lock)$/.test(file) && file !== 'pnpm-lock.yaml',
  )
  .map((file) => join(root, file))
  .filter((file) => existsSync(file));

const targets = [
  ...walk(join(root, 'apps/web/.next/static')),
  ...walk(join(root, 'apps/web/.next/server')),
  ...walk(join(root, 'apps/api/dist')),
  ...trackedFiles,
];

const findings = [];
for (const file of targets) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const rel = file.slice(root.length + 1);
  if (GOOGLE_KEY.test(text))
    findings.push(`${rel}: contém algo no formato de chave de API do Google`);
  for (const [name, value] of secrets) {
    if (text.includes(value)) findings.push(`${rel}: contém o valor de ${name}`);
  }
}

// The key must never be read by browser code: no NEXT_PUBLIC_ variable may carry a secret name.
for (const file of walk(join(root, 'apps/web/src'))) {
  if (/NEXT_PUBLIC_[A-Z_]*(GEMINI|API_KEY|SECRET|PASSWORD)/.test(readFileSync(file, 'utf8'))) {
    findings.push(`${file.slice(root.length + 1)}: variável NEXT_PUBLIC_ com nome de segredo`);
  }
}

if (findings.length > 0) {
  console.error(
    `check:secrets FALHOU (${findings.length}):\n${findings.map((f) => `  - ${f}`).join('\n')}`,
  );
  process.exit(1);
}
console.log(
  `check:secrets ok: ${targets.length} arquivos verificados (${secrets.length} segredo(s) configurado(s) comparado(s)).`,
);
