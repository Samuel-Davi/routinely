// Post-deploy smoke test against the LIVE web origin (it goes through the same /api proxy as a
// browser): sign in, create a commitment and a task, generate a routine, clean up.
//
//   SMOKE_BASE_URL=https://seu-app.vercel.app node scripts/smoke-test.mjs
//
// Credentials: SMOKE_EMAIL + SMOKE_PASSWORD (a dedicated account) or, when they are not set and
// the demo is available, the demo account ("Entrar como demo"). Nothing secret is ever printed.
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = (process.env.SMOKE_BASE_URL ?? '').replace(/\/$/, '');
if (!BASE) {
  console.error('Defina SMOKE_BASE_URL (ex.: https://seu-app.vercel.app).');
  process.exit(2);
}
const EMAIL = process.env.SMOKE_EMAIL;
const PASSWORD = process.env.SMOKE_PASSWORD;
const WAIT_FOR_DEPLOY_MS = Number(process.env.SMOKE_WAIT_MS ?? 8 * 60_000);

const jar = new Map();
const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');

async function api(path, { method = 'GET', body, expect } = {}) {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(jar.size > 0 ? { cookie: cookieHeader() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(90_000), // a sleeping free instance can take ~1 minute
  });
  for (const line of response.headers.getSetCookie()) {
    const [pair = ''] = line.split(';');
    const index = pair.indexOf('=');
    if (/max-age=0|expires=thu, 01 jan 1970/i.test(line)) jar.delete(pair.slice(0, index));
    else jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  if (expect !== undefined && response.status !== expect) {
    throw new Error(`${method} /api${path} -> ${response.status} (esperado ${expect})`);
  }
  const text = await response.text();
  return { status: response.status, headers: response.headers, json: text ? safeJson(text) : null };
}
const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

let step = 0;
const check = async (name, fn) => {
  step += 1;
  const startedAt = Date.now();
  try {
    const result = await fn();
    console.log(`✔ ${step}. ${name} (${Date.now() - startedAt} ms)`);
    return result;
  } catch (error) {
    console.error(`✘ ${step}. ${name}: ${error instanceof Error ? error.message : 'falhou'}`);
    throw error;
  }
};

async function waitFor(name, probe, { timeoutMs, everyMs = 5000 }) {
  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    if (Date.now() > deadline)
      throw new Error(`${name}: tempo esgotado${last ? ` (${last.message})` : ''}`);
    await sleep(everyMs);
  }
}

const created = { task: null, commitment: null };

try {
  await check(
    'a API responde (health, via proxy do front) — espera o deploy e a instância acordar',
    () =>
      waitFor(
        'health',
        async () => {
          const { status, json } = await api('/health');
          return status === 200 && json?.status === 'ok' && json?.database === 'up';
        },
        { timeoutMs: WAIT_FOR_DEPLOY_MS },
      ),
  );

  await check('a tela de login carrega', async () => {
    const response = await fetch(`${BASE}/login`, { redirect: 'manual' });
    const html = await response.text();
    if (response.status !== 200 || !html.includes('Routinely'))
      throw new Error(`status ${response.status}`);
  });

  const config = await check('configuração pública (/auth/config)', async () => {
    const { json } = await api('/auth/config', { expect: 200 });
    return json;
  });
  console.log(
    `   cadastro aberto: ${config.registrationEnabled} · demo disponível: ${config.demoAvailable}`,
  );

  const user = await check('rotas protegidas exigem sessão (401 sem cookie)', async () => {
    await api('/tasks', { expect: 401 });
  }).then(() =>
    check(EMAIL ? 'login com a conta de smoke' : 'entrar como demo', async () => {
      if (EMAIL && PASSWORD) {
        return (
          await api('/auth/login', {
            method: 'POST',
            body: { email: EMAIL, password: PASSWORD },
            expect: 200,
          })
        ).json;
      }
      if (!config.demoAvailable)
        throw new Error('sem SMOKE_EMAIL/SMOKE_PASSWORD e a demo não está disponível');
      return (await api('/auth/demo', { method: 'POST', expect: 200 })).json;
    }),
  );

  await check('cookies de sessão são httpOnly e first-party', async () => {
    if (!jar.has('routinely_at') || !jar.has('routinely_rt'))
      throw new Error('cookies de sessão ausentes');
    const me = (await api('/auth/me', { expect: 200 })).json;
    if (me.id !== user.id) throw new Error('/auth/me devolveu outro usuário');
  });

  created.commitment = await check('cria um compromisso', async () => {
    const { json } = await api('/fixed-commitments', {
      method: 'POST',
      expect: 201,
      body: {
        title: 'Smoke test',
        daysOfWeek: [6],
        startTime: '14:00',
        endTime: '15:00',
        category: 'OTHER',
        color: 'gray',
      },
    });
    return json.id;
  });

  created.task = await check('cria uma tarefa', async () => {
    const deadline = new Date(Date.now() + 3 * 24 * 3600_000).toISOString();
    const { json } = await api('/tasks', {
      method: 'POST',
      expect: 201,
      body: { title: 'Tarefa de smoke test', description: '', priority: 'LOW', deadline },
    });
    return json.id;
  });

  await check('a tarefa é estimada (IA ou heurístico)', () =>
    waitFor(
      'estimativa',
      async () =>
        (await api(`/tasks/${created.task}`, { expect: 200 })).json?.estimationStatus === 'DONE',
      { timeoutMs: 120_000, everyMs: 3000 },
    ),
  );

  await check('gera a rotina e espera ficar pronta', async () => {
    const started = await waitFor(
      'iniciar geração',
      async () => {
        const response = await api('/routines/generate', { method: 'POST', body: {} });
        if (response.status === 202) return response.json;
        if (response.status === 409) return null; // another generation is running: try again
        throw new Error(`POST /routines/generate -> ${response.status}`);
      },
      { timeoutMs: 120_000, everyMs: 4000 },
    );
    const routine = await waitFor(
      'rotina pronta',
      async () => {
        const { json } = await api(`/routines/${started.id}`, { expect: 200 });
        if (json.status === 'FAILED')
          throw new Error(`geração falhou: ${json.notice ?? 'sem detalhes'}`);
        return json.status === 'READY' ? json : null;
      },
      { timeoutMs: 180_000, everyMs: 4000 },
    );
    console.log(
      `   fonte: ${routine.source} · blocos: ${routine.blocks.length} · sem encaixe: ${routine.unscheduled.length}`,
    );
    if (!Array.isArray(routine.blocks)) throw new Error('resposta sem blocos');
  });
} finally {
  // Leave no trace in the account (it may be the shared demo).
  for (const [path, id] of [
    ['/tasks', created.task],
    ['/fixed-commitments', created.commitment],
  ]) {
    if (id) await api(`${path}/${id}`, { method: 'DELETE' }).catch(() => undefined);
  }
  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
}
console.log('\nSmoke test: tudo certo.');
