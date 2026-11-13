# Deploy: CI, CD e modo portfólio

Guia para publicar o Routinely de graça e manter o deploy automático. Os passos estão em ordem; os que exigem
uma conta, um clique no painel de uma plataforma ou um segredo são feitos manualmente por quem publica.

> Os limites abaixo foram conferidos nas páginas oficiais em **11/11/2026**. Planos gratuitos mudam sem aviso:
> reconfira antes de depender de um número.

## 1. Arquitetura publicada

```
Navegador ──► Vercel (Next.js: páginas + proxy /api/*) ──► Render (API NestJS, Docker) ──► Supabase (Postgres)
                  ▲ cookies first-party (ADR-025)               └─► Google Gemini (chave só aqui)
```

- O navegador só fala com o domínio do front. O `/api/*` do Next encaminha para a API (`API_INTERNAL_URL`), então os
  cookies de sessão são do mesmo site (sem CORS e sem `SameSite=None`).
- A chave do Gemini existe **apenas** na API. O front nunca a vê (`pnpm check:secrets` confere isso no CI).

## 2. O que foi escolhido e por quê (com limites)

| Peça  | Escolha                                 | Limites relevantes (fonte)                                                                                                                                                                                                                                                                                                                                                                                            | Plano B                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Front | **Vercel Hobby**                        | Grátis, mas **só uso pessoal e não comercial** ([Hobby](https://vercel.com/docs/plans/hobby)): serve para portfólio, não para cobrar de clientes. 100 GB de transferência rápida, 1 milhão de requisições de CDN e de invocações de função por mês; função com até 300 s; 100 deploys por dia. [Deploy hooks](https://vercel.com/docs/deploy-hooks): 5 por projeto e 60 disparos por hora.                            | O mesmo `Dockerfile` do web em um segundo serviço do Render (mas veja a nota das 750 h).                                                                                                                                                                                                                                                                                        |
| API   | **Render, web service grátis** (Docker) | [Free](https://render.com/docs/free): **dorme após 15 min sem tráfego e leva cerca de 1 minuto para acordar**; **750 horas grátis por mês por workspace** (um serviço ligado o mês inteiro usa ~744 h; dois não cabem); serviço parado não gasta horas. Banda e minutos de build: a página não traz números, veja em _Billing_.                                                                                       | [Railway](https://docs.railway.com/reference/pricing/plans): plano Free com US$ 1 de crédito/mês (1 réplica, 0,5 GB de RAM, 1 vCPU) ou Hobby a US$ 5/mês com US$ 5 de uso incluído. [Fly.io](https://docs.fly.io/about/pricing): **não há plano grátis**; US$ 1 de crédito por 7 dias e depois cartão; uma máquina pequena (256 MB) custa ~US$ 2,19/mês + US$ 0,02/GB de saída. |
| Banco | **Supabase Free**                       | [Planos](https://supabase.com/docs/guides/platform/billing-on-supabase): **500 MB por projeto**, 2 projetos grátis, 5 GB de egress. [Pausa](https://supabase.com/docs/guides/platform/free-project-pausing): projeto com **pouca atividade em 7 dias é pausado** (e-mail de aviso ~1 semana antes). Restauração pelo painel: a página de pausa diz **1 ano**, a página de troubleshooting diz **90 dias**: assuma 90. | Postgres do Render **não serve**: o grátis expira em 30 dias (+14 de carência) e tem 1 GB.                                                                                                                                                                                                                                                                                      |
| CD    | **GitHub Actions + deploy hooks**       | Ver a seção 7 (justificativa).                                                                                                                                                                                                                                                                                                                                                                                        | Integração nativa de cada plataforma.                                                                                                                                                                                                                                                                                                                                           |

Por que o Render mesmo dormindo: é o único serviço grátis **sem cartão** que roda o mesmo Docker do projeto. O custo
é a primeira visita do dia demorar ~1 minuto (a UI mostra o carregamento; o smoke test espera até 8 min).
**Cuidado com as 750 h:** o front é Vercel, então só a API consome horas; não suba um segundo serviço ligado 24 h.

## 3. Passo 1: repositório, CI e proteção da `main`

1. Crie o repositório em <https://github.com/new> (vazio, sem README). Anote `<dono>/<repo>`.
2. No seu computador, na pasta do projeto:
   ```bash
   git remote add origin git@github.com:<dono>/<repo>.git   # ou a URL https
   git push -u origin main
   ```
   (o push usa as credenciais do Git de quem publica.)
3. Abra a aba **Actions**: o workflow **CI** roda sozinho (lint, typecheck, testes, build, imagens Docker e
   `check:secrets`). Espere ficar verde. Se falhar, o log mostra o comando; rode o mesmo localmente.
4. Proteção da `main`: _Settings → Branches → Add branch ruleset_ (ou _branch protection rule_) para
   `main`: marque **Require status checks to pass** e selecione os jobs do CI (_Lint and typecheck_, _Web tests (Vitest)_,
   _API tests (Jest + Postgres)_, _Build web and API_ e os três _Docker image_), e **Block force pushes**. Com
   _Require a pull request_ ligado, o merge só ocorre com CI verde; o deploy (seção 7) dispara no push resultante.
5. Crie o ambiente de segredos: _Settings → Environments → New environment_ → nome **`production`**.
   Opcional e recomendado: em _Required reviewers_ adicione a si mesmo para aprovar cada deploy.

## 4. Passo 2: Supabase (banco)

1. Crie a conta em <https://supabase.com> e um projeto (_New project_). Guarde a **senha do banco**
   (ela só é mostrada na criação; dá para redefinir em _Project Settings → Database_). Escolha uma região **próxima da
   do Render** (a página do Render não lista as regiões do plano grátis: veja as opções ao criar o serviço e use a
   mesma região ou a mais próxima).
2. Clique em **Connect** (topo do projeto) e copie a **Session pooler** (porta **5432**):
   ```
   postgresql://postgres.<ref>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres
   ```
   Por que ela: a doc de [conexão](https://supabase.com/docs/guides/database/connecting-to-postgres) diz que o
   _shared pooler_ é IPv4 em todos os planos e a **conexão direta é só IPv6 no plano grátis**; um servidor sem IPv6
   não alcança o host direto. A API é um processo longo, então o modo _session_ (5432) é o indicado; o modo
   _transaction_ (6543) é para serverless.
3. Use essa **mesma string** para `DATABASE_URL` e para `DIRECT_URL` (as migrations também funcionam no modo
   _session_). Acrescente `?schema=public` ao final se quiser ser explícito.
4. **Aplique as migrations** (uma vez, do seu computador; depois o CD faz isso sozinho):
   ```bash
   DATABASE_URL='<string>' DIRECT_URL='<string>' pnpm --filter @routinely/api exec prisma migrate deploy
   ```
   Confira em _Table Editor_ se existem `User`, `Task`, `FixedCommitment`, `Routine`, `RoutineBlock`,
   `RefreshToken`, `AiUsage`, `AiGlobalUsage` e `_prisma_migrations`.
5. **Recomendado:** o Supabase expõe as tabelas do schema `public` pela API REST dele. A aplicação não usa isso, então
   ative o RLS **sem políticas** (ninguém, além do dono da conexão, lê as tabelas). No _SQL Editor_:
   ```sql
   DO $$ DECLARE t record; BEGIN
     FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
       EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
     END LOOP; END $$;
   ```
   Depois rode o smoke test (seção 8) para confirmar que a API continua lendo e gravando: ele é o teste de que o papel
   usado pela connection string não é bloqueado pelo RLS. Se algo quebrar, desligue com
   `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`.
6. **Risco de pausa:** projeto sem atividade por 7 dias é pausado. O workflow diário **Reset demo account** (seção 11)
   escreve no banco todo dia e evita isso, mas **o GitHub desliga workflows agendados de repositório público após 60
   dias sem atividade** ([docs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows));
   se acontecer, reative em _Actions → Reset demo account → Enable workflow_. Se o projeto pausar, use _Restore
   project_ no painel (os dados voltam).

## 5. Passo 3: API no Render

1. Crie a conta em <https://render.com> (login com GitHub) e autorize o acesso ao repositório.
2. _New → Blueprint_ → escolha o repositório. O Render lê o `render.yaml` da raiz (serviço `routinely-api`, plano
   `free`, runtime Docker, `healthCheckPath: /health`, `autoDeploy: false`).
3. Ele pede os valores marcados com `sync: false`. **Cole-os você mesmo; nunca os coloque no Git:**

   | Variável                      | Valor                                                                                   |
   | ----------------------------- | --------------------------------------------------------------------------------------- |
   | `DATABASE_URL`, `DIRECT_URL`  | a Session pooler do passo 2                                                             |
   | `JWT_SECRET`                  | `openssl rand -base64 48` (≥ 32 caracteres; sem ele a API **recusa subir** em produção) |
   | `GEMINI_API_KEY`              | sua chave de <https://aistudio.google.com/apikey>                                       |
   | `CORS_ORIGINS`                | a URL do front (passo 4), ex.: `https://routinely.vercel.app`                           |
   | `DEMO_EMAIL`, `DEMO_PASSWORD` | e-mail e senha **da conta demo** (invente; seção 11)                                    |

   As demais já vêm do `render.yaml`: `NODE_ENV=production`, `COOKIE_SECURE=true`, `REGISTRATION_ENABLED=false`,
   `DEMO_ENABLED=true`, `AI_DAILY_LIMIT=20`, `AI_GLOBAL_DAILY_LIMIT=100`, `AI_PLANNING_STRATEGY=order-day`,
   `GEMINI_MODEL` e `GEMINI_RETRY_MODEL` (ambos `gemini-3.5-flash-lite`, veja a seção 10) e `TRUST_PROXY=2`.

4. Clique em **Apply**. O primeiro build leva alguns minutos. Quando terminar, abra
   `https://<seu-servico>.onrender.com/health`: deve responder `{"status":"ok","database":"up",...}`.
5. **Logs:** painel do serviço → _Logs_ (JSON do pino, sem conteúdo do usuário e sem a chave). Ali aparece também a linha
   `AI models: default=... retry=...` do boot e qualquer aviso de modelo substituído.
6. **Deploy hook:** _Settings → Deploy Hook_ → copie a URL. Ela é um segredo (quem a tem faz deploy):
   guarde para a seção 7.

**`TRUST_PROXY=2`:** o limite de login/cadastro é por IP. Atrás do Render o cabeçalho `X-Forwarded-For` chega como
`<cliente>, <IP do Vercel>`; com `2`, a API ignora os dois saltos confiáveis da direita e enxerga o IP do cliente.
Valide depois do deploy: de duas redes diferentes, erre a senha 11 vezes numa
(deve bloquear) e confirme que a outra continua entrando. Se todos parecerem o mesmo IP, ajuste o número.

## 6. Passo 4: front na Vercel

1. Crie a conta em <https://vercel.com> (login com GitHub) → _Add New → Project_ → importe o repositório.
2. Em _Configure Project_: **Root Directory = `apps/web`** (framework: Next.js). Os comandos de instalação e build
   já estão no `apps/web/vercel.json` (instalam pela raiz do monorepo e compilam o pacote `shared` antes). O mesmo
   arquivo desliga o deploy automático da `main` (`git.deploymentEnabled`): quem publica é o CD, depois do CI. **Atenção:** a
   documentação da Vercel não diz se o deploy hook continua funcionando com essa chave. Confirme no primeiro deploy pelo CD
   que a Vercel mostra um deploy acionado por _Deploy Hook_; se não mostrar, remova o bloco `git` do `vercel.json` (a Vercel
   passa a publicar a cada push na `main`, e o hook fica redundante).
3. **Environment Variables** (_Production_):

   | Variável                       | Valor                                                                         |
   | ------------------------------ | ----------------------------------------------------------------------------- |
   | `API_INTERNAL_URL`             | a URL da API no Render, sem barra final: `https://<seu-servico>.onrender.com` |
   | `NEXT_PUBLIC_API_URL`          | **deixe vazio / não crie** (o navegador chama `/api/*` na própria origem)     |
   | `NEXT_PUBLIC_DEFAULT_TIMEZONE` | `America/Manaus` (ou o seu fuso)                                              |

4. **Deploy** uma vez (botão do assistente). Em _Settings → Git → Deploy Hooks_ crie um hook chamado `ci`, branch
   `main`, e copie a URL. Também um segredo. Volte ao Render e ajuste `CORS_ORIGINS` para a URL final.
5. **Domínio:** o `*.vercel.app` já funciona. Domínio próprio é opcional (_Settings → Domains_; até 50 por projeto no Hobby).
6. **Verifique os cookies** (a parte que só se prova em produção): abra o site numa janela anônima, entre com a conta
   demo e, em _DevTools → Application → Cookies_, confira `routinely_at` e `routinely_rt` **no domínio do front**, com
   `HttpOnly`, `Secure` e `SameSite=Lax`. Em _Network_, todas as chamadas devem ir para `seu-site/api/...`.
7. Se a página pedir login da Vercel, desative a proteção de deploy para produção (_Settings → Deployment Protection_).

## 7. Passo 5: CD (deploy só depois do CI verde)

`.github/workflows/deploy.yml` roda **somente** quando o workflow CI termina com sucesso para um _push_ na `main`
(`workflow_run`). Ele faz checkout do **commit exato** que o CI aprovou e: (1) aplica as migrations no Supabase,
(2) dispara o deploy hook do Render, (3) dispara o da Vercel e (4) roda o smoke test no site de verdade.

**Por que Actions + hooks e não a integração nativa?** A do Render tem _Auto-Deploy: After CI Checks Pass_
([changelog](https://render.com/changelog/skip-auto-deploying-if-ci-checks-fail)), mas a Vercel publica **todo push**
sem esperar o CI. Os hooks dão **um único portão** para as duas plataformas e deixam as migrations rodarem antes
do código novo (migrations são aditivas, regra do projeto). O custo: dois segredos a mais. Segundo a
[doc do Render](https://render.com/docs/deploy-hooks), usar o hook é o caminho recomendado para CD guiado por CI.

Segurança do workflow: ações **fixadas por SHA**, `permissions: contents: read` (o `GITHUB_TOKEN` só lê), segredos só no
ambiente `production`, `concurrency` sem cancelar (uma migration não é interrompida), checagem de que o CI era de um
_push_ na `main` (não de PR de fork) e nenhum `${{ }}` dentro de scripts (segredos passam por variáveis de ambiente).

Em _Settings → Environments → production_ cadastre:

| Tipo              | Nome                                        | Valor                                                     |
| ----------------- | ------------------------------------------- | --------------------------------------------------------- |
| Secret            | `DATABASE_URL` / `DIRECT_URL`               | a Session pooler (passo 2)                                |
| Secret            | `RENDER_DEPLOY_HOOK_URL`                    | do passo 3                                                |
| Secret            | `VERCEL_DEPLOY_HOOK_URL`                    | do passo 4                                                |
| Secret            | `JWT_SECRET`, `DEMO_EMAIL`, `DEMO_PASSWORD` | os mesmos do Render (usados pelo reset diário da demo)    |
| Secret (opcional) | `SMOKE_EMAIL` / `SMOKE_PASSWORD`            | conta dedicada ao smoke test; sem elas o teste usa a demo |
| Variable          | `WEB_URL`                                   | a URL pública do front, sem barra final                   |

Disparar na mão: _Actions → Deploy → Run workflow_.

## 8. Passo 6: smoke test, rollback e checklist

**Smoke test** (`scripts/smoke-test.mjs`, roda sozinho no CD e também na mão):

```bash
SMOKE_BASE_URL=https://seu-site.vercel.app node scripts/smoke-test.mjs
```

Ele espera o deploy e a instância acordarem (até 8 min), confere a tela de login, o `/auth/config`, que rota
protegida dá 401, entra (conta de smoke, ou "Entrar como demo"), confere cookies, **cria um compromisso e uma tarefa,
gera a rotina e espera ficar pronta**, e apaga o que criou. Como o cadastro é fechado em produção, o passo
"cadastro" do roteiro vira "login"; para testar o cadastro de verdade, abra `REGISTRATION_ENABLED=true` temporariamente.

**Rollback:**

1. **Front:** Vercel → _Deployments_ → o deploy anterior → _Promote to Production_ (troca imediata, sem rebuild).
2. **API:** Render → _Events/Deploys_ → o deploy anterior → _Rollback_ (se não aparecer no plano grátis, _Manual Deploy →
   Deploy a specific commit_ com o SHA anterior).
3. **Banco:** as migrations são aditivas, então a versão anterior do código continua funcionando com o schema novo.
   Não há migration "down". Antes de uma migration arriscada faça um `pg_dump` (o Supabase Free não promete backup
   restaurável por você). Pare o CD enquanto investiga: _Actions → Deploy → ⋯ → Disable workflow_.
4. Se um segredo vazou: gere outro (`JWT_SECRET` invalida todas as sessões), revogue o deploy hook (_Regenerate hook_)
   e rode o CD de novo.

**Checklist pós-deploy:** `/health` ok · login e cookies `HttpOnly; Secure; SameSite=Lax` no domínio do front ·
`/api/auth/config` mostra `registrationEnabled:false` e `demoAvailable:true` · "Entrar como demo" funciona · gerar
rotina na demo mostra "Modo demo, sem IA" · gerar rotina na sua conta usa a IA (veja o log do Render) · o limite de
tentativas de login isola IPs diferentes (nota do `TRUST_PROXY`).

## 9. Custos e limites

R$ 0, sem cartão (Vercel Hobby, Render Free, Supabase Free e o nível gratuito do Gemini). O que pode quebrar:

- **Render dorme** (15 min) e acorda em ~1 min; 750 h/mês por workspace.
- **Supabase pausa** com pouca atividade (7 dias) e tem 500 MB.
- **Vercel Hobby é não comercial** e para de aceitar uso além dos limites até o ciclo seguinte (~30 dias).
- **Cota do Gemini** (próxima seção).

## 10. Quando a cota do Gemini acaba

O app **nunca fica sem rotina** (regra do projeto: a IA propõe, o validador decide, o heurístico é o fallback):

- Limite do Google (HTTP 429): a API tenta de novo com espera e, se persistir, gera com o **heurístico** e avisa
  "A IA atingiu o limite de uso. Rotina gerada sem IA."
- Limite diário **por usuário** (`AI_DAILY_LIMIT`) e **global** (`AI_GLOBAL_DAILY_LIMIT`, contado no banco): estourou,
  todo mundo cai no heurístico com o aviso "Limite diário de IA atingido".
- A estimativa de tarefa também cai numa estimativa sem IA (sinalizada na tarefa).

Cotas diárias de requisições da chave usada no projeto (em 11/11/2026; confira no AI Studio, elas mudam por chave e por plano): `gemini-3.5-flash`
e `-flash-lite` **500/dia**; `gemini-3.6-flash` e `gemini-3.8-flash` **só 20/dia**. Por isso o `render.yaml` usa
`gemini-3.5-flash-lite` também como modelo de _retry_, e `AI_GLOBAL_DAILY_LIMIT=100` mantém uma folga grande (cada
geração usa 1 a 2 chamadas e cada estimativa, 1). Ajuste os dois limites à cota real da sua chave.

## 11. Modo portfólio

Configuração pensada para um link público de currículo: **ninguém se cadastra, visitantes usam uma conta demo sem IA e
só você usa a IA de verdade.**

**Variáveis em produção** (já no `render.yaml`; os segredos você cola):

| Variável                                 | Valor            | Efeito                                                       |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------ |
| `REGISTRATION_ENABLED`                   | `false`          | `POST /auth/register` responde 403 e a tela de cadastro some |
| `DEMO_ENABLED`                           | `true`           | o botão "Entrar como demo" aparece (só se a conta existir)   |
| `DEMO_EMAIL`, `DEMO_PASSWORD`            | segredos seus    | credenciais da conta demo (nunca no código)                  |
| `DEMO_MAX_TASKS`, `DEMO_MAX_COMMITMENTS` | 15 / 20 (padrão) | tetos de escrita da demo                                     |
| `AI_DAILY_LIMIT`                         | `20`             | usos de IA por usuário e por dia                             |
| `AI_GLOBAL_DAILY_LIMIT`                  | `100`            | usos de IA somando todos, por dia                            |

**Criar a conta demo (uma vez) e restaurá-la.** Com as variáveis de produção no seu shell (use o
`DATABASE_URL` real, que é um segredo):

```bash
DATABASE_URL='<session pooler>' DIRECT_URL='<session pooler>' NODE_ENV=production \
JWT_SECRET='<o mesmo do Render>' DEMO_EMAIL='<...>' DEMO_PASSWORD='<...>' GEMINI_API_KEY= \
pnpm demo:reset
```

O comando é idempotente: cria a conta se faltar e **apaga e recria** os dados fictícios (compromissos, tarefas e uma rotina
já gerada). Ele é o mesmo do workflow **Reset demo account**, que roda **todo dia às 06:17 UTC** (também manual em
_Actions → Reset demo account → Run workflow_). Os visitantes dividem **uma só conta**: veem as alterações uns dos outros
até o próximo reset, e as sessões abertas não são derrubadas.

**Criar a sua conta real** (o cadastro está fechado), com o banco de produção:

```bash
DATABASE_URL='<session pooler>' DIRECT_URL='<session pooler>' \
pnpm --filter @routinely/api claim-owner -- --email voce@exemplo.com --create
```

A senha é pedida no terminal, sem eco (não passa por ninguém). `--create` cria a conta num banco novo; sem ele o script só
reivindica o usuário de seed de um banco que já tinha dados. Depois, entre pela tela de login.

**O que é público, o que exige login e o que gasta cota:**

- _Público:_ a tela de login, `GET /api/auth/config`, `GET /health`.
- _Exige login:_ todo o resto, incluindo gerar rotina, estimar tarefas e o painel.
- _Gasta cota do Gemini:_ só contas **não demo**, dentro dos limites acima. A demo nunca chama a IA.

**Qualquer mudança de variável no Render reinicia a API** (e ela dorme de novo em 15 min sem tráfego).
