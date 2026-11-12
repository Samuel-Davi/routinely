# Checklist de deploy (ordem exata de execução)

Para quem **nunca fez deploy**. Siga os passos **na ordem**, marque cada caixa e só avance quando o item
**"Verifique"** der o resultado esperado. Tudo que só você pode fazer (criar contas, clicar em painéis, colar segredos)
está marcado como **AÇÃO MANUAL**; eu não tenho acesso às suas contas nem credenciais.

> Este documento é o roteiro. O `docs/DEPLOY.md` explica o **porquê** das escolhas. Limites e comportamentos dos planos
> gratuitos foram conferidos nas páginas oficiais em **12/11/2026** (Parte K, com os links).

## Mapa (leia uma vez)

```
Navegador ──► Vercel (Next.js: páginas + proxy /api/*) ──► Render (API NestJS, Docker) ──► Supabase (Postgres)
                                                              └─► Google Gemini (a chave só existe aqui)
GitHub Actions: CI (testa) ─► Deploy (migrations ─► hook do Render ─► hook da Vercel ─► smoke test)
```

**Nomes que este checklist usa (copie exatamente):**

| O quê               | Nome                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Repositório GitHub  | `routinely` (em `Samuel-Davi/routinely`)                                                            |
| Serviço no Render   | `routinely-api` (região **Oregon**, fixada no `render.yaml`)                                        |
| Projeto na Vercel   | `routinely` (Root Directory **`apps/web`**)                                                         |
| Projeto no Supabase | `routinely`                                                                                         |
| Ambiente do GitHub  | `production`                                                                                        |
| Workflows           | `CI` (`.github/workflows/ci.yml`), `Deploy` (`deploy.yml`), `Reset demo account` (`demo-reset.yml`) |

**Sobre o "ciclo de URLs" (API ↔ web ↔ CORS):** na prática não há ciclo que trave. O navegador **nunca** chama a API: ele
só fala com a Vercel, que repassa `/api/*` para o Render (servidor com servidor, sem `Origin`). Por isso a API **não**
precisa saber a URL do front para funcionar; `CORS_ORIGINS` é só uma proteção extra. A ordem que resolve tudo é:
**Render (descobre a URL da API) → Vercel (usa a URL da API; descobre a URL do front) → volta ao Render e ao GitHub para
registrar a URL do front** (passos 22 e 24).

---

## Parte A: preparar o seu computador

- [ ] **1. Conferir as ferramentas** (terminal, na pasta do projeto `app-rotina-AI`).
  - Rode: `node -v && pnpm -v && git --version && openssl version`
  - Esperado: Node `v24.x` (o `.nvmrc` pede 24), pnpm `12.x`, Git e OpenSSL instalados. `psql` é opcional.
  - **Verifique:** os quatro comandos imprimem versão, sem erro. Se faltar o Node: `nvm install` (lê o `.nvmrc`).

- [ ] **2. Gerar e guardar os segredos** (**AÇÃO MANUAL**: você guarda; eu nunca vejo). Guarde num gerenciador de senhas ou numa
      nota **fora do repositório**. Cada comando imprime o valor **uma vez**.

  | Nome                   | Como gerar                                                                                          | Onde será usado                       |
  | ---------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
  | `SUPABASE_DB_PASSWORD` | `openssl rand -hex 24` (só letras e números: caracteres como `@ : / # %` quebrariam a URL do banco) | passo 7                               |
  | `JWT_SECRET`           | `openssl rand -base64 48` (≥ 32 caracteres; sem ele a API **recusa subir** em produção)             | Render (passo 13) e GitHub (passo 24) |
  | `DEMO_PASSWORD`        | `openssl rand -base64 18`                                                                           | Render, GitHub e passo 26             |
  | `DEMO_EMAIL`           | invente um e-mail de formato válido, ex.: `demo@routinely.app` (não precisa existir)                | Render, GitHub e passo 26             |
  | `GEMINI_API_KEY`       | já está no seu `.env`; para vê-la: `grep '^GEMINI_API_KEY=' .env`                                   | Render (passo 13)                     |
  - **Verifique:** `git check-ignore .env` imprime `.env` (o arquivo é ignorado pelo Git; ele **nunca** pode ir para o GitHub).

---

## Parte B: GitHub (repositório e CI)

- [ ] **3. Criar o repositório** (**AÇÃO MANUAL**).
  - Onde: <https://github.com/new> (logado como `Samuel-Davi`).
  - Preencha: _Repository name_ = `routinely`; visibilidade **Public** (portfólio; o Render e a Vercel funcionam com público ou
    privado); **não** marque _Add a README_, _.gitignore_ nem _license_.
  - **Verifique:** abre uma página vazia com "Quick setup" e a URL `https://github.com/Samuel-Davi/routinely`.

- [ ] **4. Primeiro push** (**AÇÃO MANUAL**: usa as suas credenciais do Git).
  - No terminal, na pasta do projeto:
    ```bash
    git remote add origin https://github.com/Samuel-Davi/routinely.git
    git push -u origin main
    ```
  - **Verifique:** em _Actions_ aparece a execução do workflow **CI** em andamento. Aguarde ~5–10 min.
  - Esperado: **CI** termina **verde** (7 jobs). Se ficar vermelho, abra a execução → o job → o passo que falhou e rode o mesmo
    comando localmente.
  - **Esperado e normal:** logo depois do CI verde aparece uma execução do workflow **Deploy** que **falha** no passo
    _Apply database migrations_ (ainda não existem os segredos). Ignore; ela será refeita no passo 28.

- [ ] **5. Badge de status no README** (opcional, 1 minuto).
  - Em `README.md`, apague as marcas `<!--` e `-->` do bloco do topo e troque `DONO/REPO` por `Samuel-Davi/routinely`:
    ```md
    [![CI](https://github.com/Samuel-Davi/routinely/actions/workflows/ci.yml/badge.svg)](https://github.com/Samuel-Davi/routinely/actions/workflows/ci.yml)
    ```
  - `git add README.md && git commit -m "docs: add CI badge" && git push`
  - **Verifique:** o badge verde aparece na página do repositório. (Faça isto **antes** do passo 25; depois dele, a `main` só
    aceita alterações por pull request.)

---

## Parte C: Supabase (banco de dados)

- [ ] **6. Criar a conta** (**AÇÃO MANUAL**). <https://supabase.com> → _Start your project_ → _Continue with GitHub_.
  - **Verifique:** você cai no _dashboard_ com uma organização pessoal.

- [ ] **7. Criar o projeto** (**AÇÃO MANUAL**).
  - Onde: _New project_.
  - Preencha: _Name_ = `routinely`; _Database Password_ = o valor de `SUPABASE_DB_PASSWORD` (passo 2); _Region_ = a **West US
    (Oregon)** ou, se não existir, a mais próxima de **Oregon** (a região do Render está fixada em `oregon`; o rótulo exato do
    Supabase pode diferir); _Plan_ = **Free**.
  - **Verifique:** o projeto passa de _Setting up_ para ativo (1–3 min).

- [ ] **8. Copiar a string de conexão: Session pooler** (**AÇÃO MANUAL**).
  - Onde: no topo do projeto, botão **Connect** → aba da _connection string_ → _Type_ = **URI** → _Method_ = **Session pooler**.
  - Formato esperado (o `[YOUR-PASSWORD]` vem do Supabase; troque pela `SUPABASE_DB_PASSWORD`):
    ```
    postgresql://postgres.<ref-do-projeto>:<SUPABASE_DB_PASSWORD>@aws-<n>-<regiao>.pooler.supabase.com:5432/postgres
    ```
    O que importa: usuário `postgres.<ref>`, host terminando em `.pooler.supabase.com`, **porta `5432`**, banco `postgres`.
  - **Use esta mesma string para `DATABASE_URL` e para `DIRECT_URL`.** Por quê:
    - A conexão **direta** (`db.<ref>.supabase.co`) é **só IPv6** no plano grátis, e **o Render não tem IPv6 de saída**: ela
      falharia ([Supabase: conexão](https://supabase.com/docs/guides/database/connecting-to-postgres),
      [Render: conectar ao Supabase](https://render.com/articles/how-to-connect-a-render-service-to-supabase-postgres)).
    - A _pooler_ em modo **session** (5432) é IPv4 e é a indicada pela Render para processos de longa duração; o Prisma Migrate
      também funciona nela. O modo _transaction_ (6543) **não** serve para migrations.
  - **Verifique:** a string não contém `[YOUR-PASSWORD]`, não tem espaços e termina em `:5432/postgres`.

- [ ] **9. Criar o schema: rodar as migrations pela primeira vez** (**AÇÃO MANUAL**, do seu computador).
  - **Quando as migrations rodam na produção:** esta é a 1ª vez, à mão. Depois, o workflow **Deploy** roda
    `prisma migrate deploy` **antes** de disparar os deploys (passo 28). O Render **não** roda migrations (a imagem de
    produção não tem a CLI do Prisma).
  - No terminal (o `read -s` não ecoa nem grava a string no histórico):
    ```bash
    cd ~/Desktop/myarchives/studies/github/app-rotina-AI      # ajuste se o caminho for outro
    read -rsp 'Cole a Session pooler e tecle Enter: ' PROD_DB; echo
    export DATABASE_URL="$PROD_DB" DIRECT_URL="$PROD_DB"
    pnpm --filter @routinely/api exec prisma migrate deploy
    ```
  - **Verifique:** a saída termina com `6 migrations found` e `All migrations have been successfully applied.`
    - `P1001 Can't reach database`: a string está errada (porta, host ou senha) ou usa a conexão direta.
    - `P1000 Authentication failed`: senha errada ou com caracteres especiais (regenere com `openssl rand -hex 24`).
  - **Deixe o terminal aberto** (as variáveis serão reusadas nos passos 26 e 27).

- [ ] **10. Conferir as tabelas** (**AÇÃO MANUAL**).
  - Onde: Supabase → **SQL Editor** → _New query_.
  - Cole e rode (_Run_):
    ```sql
    select table_name from information_schema.tables where table_schema = 'public' order by 1;
    select count(*) as migrations from _prisma_migrations;
    ```
  - Esperado: **11 tabelas**: `AiGlobalUsage`, `AiUsage`, `EstimateCache`, `FixedCommitment`, `Preferences`,
    `RefreshToken`, `Routine`, `RoutineBlock`, `Task`, `User`, `_prisma_migrations`; e `migrations = 6`.

- [ ] **11. (Recomendado) Ligar o RLS sem políticas** (**AÇÃO MANUAL**). O Supabase expõe as tabelas do schema `public` por uma API REST
      própria; o app não a usa, então fechamos a porta.
  - SQL Editor:
    ```sql
    do $$ declare t record; begin
      for t in select tablename from pg_tables where schemaname = 'public' loop
        execute format('alter table public.%I enable row level security', t.tablename);
      end loop; end $$;
    ```
  - **Verifique:** `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';`
    mostra `true` em todas.
  - **Atenção (não verificado):** eu não confirmei no Supabase real se a conexão do Prisma ignora o RLS. O **smoke test
    (passo 28) é o teste**. Se a API passar a dar erro de permissão, desfaça com `alter table public."<Tabela>" disable row
level security;` para cada tabela.

---

## Parte D: Render (API)

- [ ] **12. Criar a conta e dar acesso ao repositório** (**AÇÃO MANUAL**). <https://render.com> → _Get Started_ → _GitHub_;
      autorize o acesso ao repositório `routinely`.

- [ ] **13. Criar o serviço pelo Blueprint** (**AÇÃO MANUAL**).
  - Onde: _New +_ → **Blueprint** → escolha `Samuel-Davi/routinely` → branch `main`. O Render lê o `render.yaml` da raiz.
  - O que ele cria (já definido no arquivo; só confira): _Type_ **Web Service**, _Runtime_ **Docker**, _Dockerfile_
    `./apps/api/Dockerfile`, _Docker context_ `.` (raiz do repositório), _Plan_ **Free**, _Region_ **Oregon**,
    _Health Check Path_ `/health`, _Auto-Deploy_ **desligado**. **Comando de start:** deixe vazio (vale o `CMD` do Dockerfile,
    `node dist/main.js`). A porta vem do `PORT` que o próprio Render injeta.
  - **Variáveis de ambiente.** As marcadas "você cola" o Render pede na hora; as "fixa" já vêm preenchidas:

    | Nome                                       | Valor / de onde vem                                                                        | Obrigatória?                                          |
    | ------------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
    | `DATABASE_URL`                             | você cola: a Session pooler (passo 8)                                                      | **Sim**                                               |
    | `DIRECT_URL`                               | você cola: a **mesma** Session pooler                                                      | **Sim** (o schema do Prisma a declara)                |
    | `JWT_SECRET`                               | você cola: o do passo 2                                                                    | **Sim** (≥ 32 caracteres; sem ele a API não sobe)     |
    | `GEMINI_API_KEY`                           | você cola: a do seu `.env`                                                                 | Opcional, mas sem ela **não há IA** (só o heurístico) |
    | `CORS_ORIGINS`                             | por enquanto `http://localhost:3000`; no passo 24 vira a URL da Vercel                     | Sim (o Render pede um valor)                          |
    | `DEMO_EMAIL`                               | você cola: o do passo 2                                                                    | Só para a demo                                        |
    | `DEMO_PASSWORD`                            | você cola: o do passo 2                                                                    | Só para a demo                                        |
    | `NODE_ENV`                                 | fixa: `production`                                                                         | Sim                                                   |
    | `LOG_LEVEL`                                | fixa: `info`                                                                               | Não                                                   |
    | `COOKIE_SECURE`                            | fixa: `true`                                                                               | Sim em produção                                       |
    | `TRUST_PROXY`                              | fixa: `2` (Render + proxy da Vercel; teste no passo 30)                                    | Sim                                                   |
    | `REGISTRATION_ENABLED`                     | fixa: `false` (cadastro fechado)                                                           | Sim no modo portfólio                                 |
    | `DEMO_ENABLED`                             | fixa: `true`                                                                               | Só para a demo                                        |
    | `GEMINI_MODEL` / `GEMINI_RETRY_MODEL`      | fixas: `gemini-3.5-flash-lite` (os dois; o `3.6` e o `3.8` só têm 20 req/dia na sua chave) | Não                                                   |
    | `AI_PLANNING_STRATEGY`                     | fixa: `order-day`                                                                          | Não                                                   |
    | `AI_DAILY_LIMIT` / `AI_GLOBAL_DAILY_LIMIT` | fixas: `20` / `100`                                                                        | Não                                                   |

    Opcionais que **não** estão no `render.yaml` e usam o padrão: `ACCESS_TOKEN_TTL_SECONDS` (900), `REFRESH_TOKEN_TTL_DAYS` (30),
    `AUTH_RATE_LIMIT_MAX` (10), `DEMO_MAX_TASKS` (15), `DEMO_MAX_COMMITMENTS` (20), `DEFAULT_TIMEZONE` (`America/Manaus`),
    `LLM_MAX_INPUT_TOKENS` (12000).

  - Clique em **Apply**.
  - **Verifique:** o serviço `routinely-api` entra em _Deploying_ e, em 5–10 min, fica **Live**.

- [ ] **14. Abrir o `/health` da API** (**AÇÃO MANUAL**).
  - Copie a URL do serviço (topo da página; algo como `https://routinely-api.onrender.com`; o Render pode acrescentar um sufixo
    se o nome estiver em uso: use a URL que ele mostrar).
  - Abra `<URL>/health` no navegador. Na 1ª vez pode demorar ~1 min (serviço grátis acordando).
  - **Verifique:** `{"status":"ok","database":"up","uptime":...}`.
  - Em _Logs_, procure: `Routinely API listening on port ...` e `AI models: default=gemini-3.5-flash-lite retry=gemini-3.5-flash-lite`.
    Se aparecer `Invalid environment configuration`, a mensagem diz qual variável falta (nunca imprime o valor).
  - **Anote a URL da API** (será `API_INTERNAL_URL` no passo 18).

- [ ] **15. Conferir que o auto-deploy está desligado** (**AÇÃO MANUAL**).
  - Onde: serviço `routinely-api` → **Settings** → seção _Build & Deploy_ → _Auto-Deploy_.
  - Esperado: **No** / _Off_. (O `render.yaml` define `autoDeploy: false`; se estiver ligado, desligue: senão o Render
    publicaria a cada push, antes do CI terminar.)

- [ ] **16. Copiar o Deploy Hook** (**AÇÃO MANUAL**).
  - Onde: serviço `routinely-api` → **Settings** → seção **Deploy Hook** → copie a URL.
  - **É um segredo** (quem a tem faz deploy). Guarde junto aos outros; vira `RENDER_DEPLOY_HOOK_URL` no passo 24.
  - **Verifique:** a URL começa com `https://api.render.com/deploy/srv-` e tem `?key=`.

---

## Parte E: Vercel (front)

- [ ] **17. Criar a conta** (**AÇÃO MANUAL**). <https://vercel.com/signup> → _Continue with GitHub_ → plano **Hobby**. (Hobby é **só uso
      pessoal/não comercial**: serve para portfólio.)

- [ ] **18. Importar o projeto** (**AÇÃO MANUAL**).
  - Onde: _Add New…_ → **Project** → _Import Git Repository_ → `Samuel-Davi/routinely` → _Import_ (se pedir, instale o app do
    GitHub da Vercel **só neste repositório**).
  - Preencha em _Configure Project_:
    - _Project Name_: `routinely`
    - _Framework Preset_: **Next.js**
    - _Root Directory_: clique em _Edit_ e escolha **`apps/web`**
    - _Include source files outside of the Root Directory in the Build Step_: **ligado** (padrão; o build precisa de `packages/shared`)
    - _Build/Install Command_: **não mexa**. O `apps/web/vercel.json` já define
      `installCommand: cd ../.. && pnpm install --frozen-lockfile --filter @routinely/web...` e
      `buildCommand: cd ../.. && pnpm --filter @routinely/shared build && pnpm --filter @routinely/web build`.
    - _Environment Variables_ (**Production**):

      | Nome                           | Valor                                                                                                                                      | Obrigatória?                                                          |
      | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
      | `API_INTERNAL_URL`             | a URL da API do passo 14, **sem barra no final**, ex.: `https://routinely-api.onrender.com`                                                | **Sim** (é para onde o proxy `/api/*` encaminha; lida **em runtime**) |
      | `NEXT_PUBLIC_DEFAULT_TIMEZONE` | `America/Manaus`                                                                                                                           | Não                                                                   |
      | `NEXT_PUBLIC_API_URL`          | **não crie** (se criar, deixe **vazio**). Qualquer valor aqui faz o front falar direto com a API e **quebra o login** (incidente de 12/11) | Não                                                                   |

  - Clique em **Deploy**.
  - **Verifique:** o build termina em _Ready_; a URL de produção (`https://routinely-….vercel.app`; **anote-a**) abre a tela de
    login. Se o build falhar, o log do build diz o comando; um erro de `pnpm` indica que o _Root Directory_ não é `apps/web`.

- [ ] **19. Provar que o proxy chega à API** (**AÇÃO MANUAL**).
  - Abra `https://<sua-url>.vercel.app/api/health`.
  - **Verifique:** o mesmo JSON do passo 14 (`"status":"ok","database":"up"`). Se vier `502 UPSTREAM_UNAVAILABLE`, o
    `API_INTERNAL_URL` está errado ou a API ainda está acordando (espere 1 min e recarregue). Se pedir login da Vercel,
    _Settings → Deployment Protection_: a produção precisa estar **sem** _Vercel Authentication_.

- [ ] **20. Criar o Deploy Hook da Vercel** (**AÇÃO MANUAL**).
  - Onde: projeto `routinely` → **Settings** → **Git** → seção **Deploy Hooks** → _Name_ = `ci`, _Branch_ = `main` → **Create Hook** → copie a URL.
  - **É um segredo.** Guarde; vira `VERCEL_DEPLOY_HOOK_URL` no passo 24. Formato:
    `https://api.vercel.com/v1/integrations/deploy/prj_…/…`.

- [ ] **21. Evitar deploy duplicado: como funciona e como confirmar** (**AÇÃO MANUAL**, a confirmação é no passo 28).
  - O que existe: o `apps/web/vercel.json` tem `"git": {"deploymentEnabled": {"main": false}}`, então um **push na `main` não
    cria deploy** pela integração Git; só o **hook**, chamado pelo workflow depois do CI verde, publica a `main`. Branches e
    pull requests continuam com deploy de _preview_.
  - **Incerteza (não verificada):** a documentação da Vercel diz que o hook **não** dispara se existir a chave antiga
    `github.enabled=false`, mas **não diz** o que acontece com `git.deploymentEnabled`
    ([Deploy Hooks](https://vercel.com/docs/deploy-hooks),
    [Git Configuration](https://vercel.com/docs/project-configuration/git-configuration)); há relatos de comunidade de hooks que
    respondem `PENDING` sem criar deploy. **Por isso o passo 28 tem uma verificação explícita.**
  - **Plano B se o hook não criar deploy:** (a) apague o bloco `"git"` do `apps/web/vercel.json` e faça commit por pull request;
    a Vercel passa a publicar a cada push na `main` (o hook vira redundante; a Vercel cancela hooks duplicados da mesma
    versão), perdendo apenas o "só depois do CI verde" **para o front**; ou (b) trocar o hook pela CLI da Vercel com um
    `VERCEL_TOKEN` (token com escopo de conta; mais poderoso que o hook).

---

## Parte F: fechar o ciclo de URLs

- [ ] **22. Registrar a URL do front no Render** (**AÇÃO MANUAL**).
  - Onde: Render → `routinely-api` → **Environment** → edite `CORS_ORIGINS`.
  - Valor: a origem exata do front, **sem barra no final**, ex.: `https://routinely-abc123.vercel.app`. (Mais de uma: separe por vírgula.)
  - Clique em **Save changes** (o serviço reinicia).
  - **Verifique:** o `/health` volta a responder depois de ~1 min.

---

## Parte G: GitHub (segredos, ambiente e proteção da `main`)

- [ ] **23. Criar o ambiente `production`** (**AÇÃO MANUAL**).
  - Onde: GitHub → repositório `routinely` → **Settings** → **Environments** → **New environment** → nome exato **`production`** → _Configure environment_.
  - Recomendado: _Required reviewers_ → adicione você mesmo (cada deploy pede a sua aprovação em _Actions_). Em um projeto solo,
    pode deixar sem.
  - **Verifique:** `production` aparece na lista. Os dois workflows de CD (`Deploy` e `Reset demo account`) usam esse nome.

- [ ] **24. Cadastrar os segredos do ambiente** (**AÇÃO MANUAL**).
  - Onde: _Settings → Environments → production → Environment secrets → Add environment secret_. Nomes **exatos**:

    | Secret                          | Valor                                                                               | Usado por                                            |
    | ------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
    | `DATABASE_URL`                  | Session pooler (passo 8)                                                            | Deploy (migrations) e Reset demo                     |
    | `DIRECT_URL`                    | a **mesma** Session pooler                                                          | Deploy e Reset demo                                  |
    | `RENDER_DEPLOY_HOOK_URL`        | do passo 16                                                                         | Deploy                                               |
    | `VERCEL_DEPLOY_HOOK_URL`        | do passo 20                                                                         | Deploy                                               |
    | `JWT_SECRET`                    | o do passo 2                                                                        | Reset demo (a CLI exige ≥ 32 caracteres em produção) |
    | `DEMO_EMAIL`                    | o do passo 2                                                                        | Reset demo                                           |
    | `DEMO_PASSWORD`                 | o do passo 2                                                                        | Reset demo                                           |
    | `SMOKE_EMAIL`, `SMOKE_PASSWORD` | **opcionais**: uma conta só para o smoke test. Sem elas o teste entra pela **demo** | Deploy (smoke test)                                  |

  - Em _Environment variables → Add environment variable_ (não é secreto):

    | Variable  | Valor                                                    |
    | --------- | -------------------------------------------------------- |
    | `WEB_URL` | a URL do front, sem barra no final (a mesma do passo 22) |

  - **Verifique:** a lista mostra os 7 secrets obrigatórios (sem o `SMOKE_*`) e a variável `WEB_URL`.

- [ ] **25. Proteger a `main`** (**AÇÃO MANUAL**). **Faça só depois do passo 5** (a regra bloqueia push direto).
  - Onde: **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
  - Preencha: _Ruleset name_ = `main`; _Enforcement status_ = **Active**; _Target branches_ → _Add target_ → **Include default branch**.
  - Marque: **Restrict deletions**; **Block force pushes**; **Require status checks to pass** → _Add checks_ e escolha **exatamente** estes
    (só aparecem depois de o CI ter rodado uma vez):
    1. `Lint and typecheck`
    2. `Web tests (Vitest)`
    3. `API tests (Jest + Postgres)`
    4. `Build web and API`
    5. `Docker image (api/prod)`
    6. `Docker image (api/migrate)`
    7. `Docker image (web/prod)`
  - **Efeito:** a partir daqui, mudanças na `main` entram por **pull request** com o CI verde; o merge dispara o CI e, se verde, o **Deploy**.
  - **Verifique:** um `git push origin main` direto passa a ser **recusado**.

---

## Parte H: dados de produção (do seu computador, sem expor senhas)

Use o **mesmo terminal** do passo 9 (se o fechou, repita o `read -rsp ...; export DATABASE_URL=... DIRECT_URL=...`).
O `read -s` não ecoa o valor e não o grava no histórico. O Node carrega o `.env` **sem sobrescrever** variáveis já
exportadas, então o `.env` local não interfere.

- [ ] **26. Criar a conta demo** (**AÇÃO MANUAL**).
  - **Antes de rodar, confirme que o terminal aponta para a PRODUÇÃO** (e não para o seu banco local). Este comando imprime só o
    host, sem a senha:
    ```bash
    node -e "console.log(new URL(process.env.DATABASE_URL).hostname)"
    ```
    Esperado: `aws-…pooler.supabase.com`. Se aparecer `localhost` ou der erro, as variáveis do passo 9 não estão exportadas: **pare**
    (o `demo:reset` apaga e recria os dados da conta demo do banco que estiver configurado). O `.env` local **não** sobrescreve
    variáveis já exportadas (testado).

  ```bash
  read -rsp 'DEMO_PASSWORD (o do passo 2): ' DEMO_PASSWORD; echo
  export DEMO_EMAIL='demo@routinely.app'            # use o MESMO e-mail do passo 2
  export NODE_ENV=production GEMINI_API_KEY=        # a demo nunca chama a IA
  export JWT_SECRET="$(openssl rand -base64 48)"    # só precisa ter ≥ 32 caracteres aqui; não precisa ser o do Render
  pnpm demo:reset
  ```
  - **Verifique:** a última linha é `Demo reset: 6 tarefas, 5 compromissos e rotina gerada.`
  - No Supabase (_Table Editor → User_): uma linha com `isDemo = true` e o e-mail da demo; em `Task`, 6 linhas dessa conta.
  - Esse mesmo comando roda **todo dia às 06:17 UTC** pelo workflow _Reset demo account_ (e mantém o banco ativo).

- [ ] **27. Criar a sua conta de dono (o cadastro está fechado)** (**AÇÃO MANUAL**).
  - Confirme o host como no passo 26 (`pooler.supabase.com`, não `localhost`).
  ```bash
  pnpm --filter @routinely/api claim-owner -- --email voce@exemplo.com --create
  ```
  - Troque `voce@exemplo.com` pelo **seu e-mail real** (é o que você usará para entrar). O script **pede a senha no terminal, sem eco**,
    duas vezes (≥ 10 caracteres, com letras e números).
  - **Verifique:** `Pronto: voce@exemplo.com é a conta do dono. Entre pelo app com ela.` e uma nova linha em `User` (sem `isDemo`).
  - Limpe o terminal: `unset DATABASE_URL DIRECT_URL PROD_DB DEMO_PASSWORD DEMO_EMAIL JWT_SECRET NODE_ENV GEMINI_API_KEY`
    (importante: com `DATABASE_URL` de produção exportada, qualquer comando local mexeria no banco **real**).

---

## Parte I: primeiro deploy pelo CD e verificação

- [ ] **28. Rodar o workflow Deploy** (**AÇÃO MANUAL**).
  - Onde: GitHub → **Actions** → **Deploy** (barra lateral) → **Run workflow** → branch `main` → _Run workflow_. (Se você marcou
    _Required reviewers_, clique em _Review deployments → production → Approve_.)
  - O que ele faz, nesta ordem: instala dependências → `prisma migrate deploy` (deve dizer `No pending migrations to apply`) →
    chama o hook do Render → chama o hook da Vercel → roda `node scripts/smoke-test.mjs` contra `WEB_URL`.
  - **Verifique:** todos os passos verdes (de 5 a 15 min, porque a API acorda e os dois builds rodam). O smoke test lista
    **10 passos `✔`** e termina com `Smoke test: tudo certo.`
  - **Verifique a incerteza do passo 21:** em **Vercel → Deployments** deve aparecer um deploy **novo**, marcado como acionado
    por _Deploy Hook_, e em **Render → Events** um deploy novo. Se a Vercel **não** mostrar o deploy, aplique o _Plano B_ do passo 21.

- [ ] **29. Conferir no navegador** (**AÇÃO MANUAL**, janela anônima, URL do front).
  1. A tela de login abre; **não** há link "Criar conta"; há o botão **Entrar como demo**.
  2. _DevTools → Network_: todas as chamadas vão para `seu-site.vercel.app/api/...` (nenhuma para `onrender.com`).
  3. **Entrar como demo** → abre o calendário com o selo **"Modo demo, sem IA"** no cabeçalho.
  4. _DevTools → Application → Cookies → seu-site.vercel.app_: `routinely_at` e `routinely_rt`, ambos **HttpOnly**, **Secure** e **SameSite=Lax**.
  5. Saia e entre com a **sua conta** (passo 27): _Gerar rotina_ deve usar a IA (sem o selo de demo; o aviso de privacidade do Google
     aparece no diálogo). Depois abra `https://seu-site.vercel.app/api/ai/status` (logado): `"configured":true`,
     `"model":"gemini-3.5-flash-lite"` e `"modelWarnings":[]`.
  6. `https://seu-site.vercel.app/api/auth/config`: `{"registrationEnabled":false,"demoAvailable":true}`.

- [ ] **30. Testar o `TRUST_PROXY=2`** (**AÇÃO MANUAL**, opcional, 5 min). O limite de login é por IP; se o valor estiver errado, todos
      os visitantes parecem o mesmo IP. **Não verificado em produção.**
  - Numa rede (ex.: Wi-Fi), erre a senha do seu e-mail **11 vezes**: a 11ª deve responder `429 Muitas tentativas`. Em **outra rede**
    (ex.: 4G do celular), o login **deve continuar funcionando**.
  - Se a 2ª rede também foi bloqueada, ajuste `TRUST_PROXY` no Render (tente `1` ou `3`) e repita.

- [ ] **31. Saber onde olhar os logs.**
  - **Render** → `routinely-api` → _Logs_ (JSON, sem conteúdo do usuário nem chave). Procure: `listening on port`, `AI models:`, `WARN`,
    `ERROR`, `estimateTask`/`generateRoutine` com `RATE_LIMIT`/`OVERLOADED`/`TIMEOUT`.
  - **Vercel** → projeto → _Logs_. No plano Hobby os _Runtime Logs_ guardam **só 1 hora**: diagnostique logo depois do erro.
  - **GitHub** → _Actions_ → a execução → o passo que falhou.
  - **Supabase** → _Logs_ (consultas e erros do Postgres).

- [ ] **32. Confirmar o ciclo completo** (**AÇÃO MANUAL**). Faça uma alteração trivial por **pull request** (ex.: uma linha no README), faça o merge e veja:
      **CI** verde → **Deploy** automático (com sua aprovação, se ligou) → site atualizado.
  - **Verifique:** o _Deploy_ só começou **depois** do CI verde (um CI vermelho **não** dispara deploy).

---

## Parte J: diagnóstico dos 5 erros mais prováveis

| #   | Sintoma                                                           | Causa mais provável                                                                                                                                                                                                                                                                                       | Como confirmar                                                                                              | Como resolver                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Cookie não grava**: o login responde OK mas volta para `/login` | O front está chamando a API **direto** (bundle com `NEXT_PUBLIC_API_URL`), então o cookie é de outra origem e é descartado. Ou a Vercel Authentication está interceptando                                                                                                                                 | _Network_: o `POST .../auth/login` vai para `onrender.com` em vez de `/api/auth/login`; o _Set-Cookie_ some | Na Vercel, apague `NEXT_PUBLIC_API_URL`; confira `API_INTERNAL_URL`; **Redeploy** (a variável é embutida no build); limpe os cookies do site                                                                                    |
| 2   | **CORS**: `blocked by CORS policy` no console                     | Só acontece se o navegador falar direto com a API (mesma causa do nº 1), ou `CORS_ORIGINS` com barra no final / origem diferente                                                                                                                                                                          | Console mostra a URL `onrender.com` e `No 'Access-Control-Allow-Origin'`                                    | Resolva o nº 1; no Render deixe `CORS_ORIGINS` = origem exata, **sem barra**, igual à da barra de endereço                                                                                                                      |
| 3   | **401 em loop**: a tela fica recarregando ou voltando ao login    | Cookie velho (sessão inválida) ou o banco foi recriado e os tokens sumiram; um `JWT_SECRET` trocado derruba só os tokens de acesso                                                                                                                                                                        | Render _Logs_: repetição de `POST /auth/refresh` com `401`                                                  | O app limpa a sessão sozinho (faz `/auth/logout` e vai ao login, no máximo 1 vez a cada 10 s). Se persistir: apague os cookies do site e entre de novo                                                                          |
| 4   | **Migration falhou** (passo `Apply database migrations` vermelho) | `P1001` (não alcança o banco: string errada ou conexão **direta** IPv6), `P1000` (senha), `P3009` (uma migration anterior ficou marcada como falha), erro de _prepared statement_ (usou a porta **6543**)                                                                                                 | Log do passo no GitHub Actions: o código `P…`                                                               | Use a Session pooler `:5432` nos dois secrets; senha só com letras e números; para `P3009`: `pnpm --filter @routinely/api exec prisma migrate resolve --rolled-back <nome>` com as variáveis do passo 9 e rode o Deploy de novo |
| 5   | **IA caindo no heurístico**                                       | Veja o aviso na rotina: **"Modo demo, sem IA"** (conta demo, é o esperado); **"IA não configurada"** (falta `GEMINI_API_KEY` no Render); **"Limite diário de IA atingido"** (`AI_DAILY_LIMIT` ou `AI_GLOBAL_DAILY_LIMIT`); **"A IA atingiu o limite de uso"** (429 do Google); **"sobrecarregada"** (503) | `/api/ai/status` (logado): `configured` e `modelWarnings`; Render _Logs_: `RATE_LIMIT`/`OVERLOADED`         | Cole a chave no Render; aumente os limites (cota da chave: 3.5 flash 500/dia, 3.6/3.8 20/dia); espere a cota renovar. O app continua funcionando: o heurístico é o plano B                                                      |

Outros sintomas comuns: **`502 UPSTREAM_UNAVAILABLE`** = a API está acordando (espere ~1 min) ou `API_INTERNAL_URL` errado;
**o primeiro acesso do dia demora** = o Render grátis dormiu (Parte K); **erros esporádicos de conexão com o banco nos logs** = o
Render pode reiniciar conexões longas com bancos externos ([fonte](https://render.com/articles/how-to-connect-a-render-service-to-supabase-postgres));
o Prisma reconecta na próxima consulta.

---

## Parte K: limites e comportamentos dos planos gratuitos (fontes oficiais, conferidas em 12/11/2026)

| Plano                           | O que importa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Fonte                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Render (web service grátis)** | **Dorme após 15 min sem tráfego** e leva **cerca de 1 minuto** para voltar. **750 horas grátis por mês por workspace** (uma API ligada o mês todo usa ~744 h; **não** suba um segundo serviço grátis ligado 24 h). Banda e minutos de build: contam contra o incluído mensal, sem número na página (veja _Billing_). Postgres grátis do Render **expira em 30 dias** (por isso usamos o Supabase). Regiões: Oregon, Ohio, Virginia, Frankfurt, Singapore (a página **não** diz quais têm instância grátis). **Sem IPv6 de saída** (fonte do Render sobre Supabase). | [Render: Free](https://render.com/docs/free), [Regiões](https://render.com/docs/regions), [Render + Supabase](https://render.com/articles/how-to-connect-a-render-service-to-supabase-postgres) |
| **Supabase Free**               | **500 MB** por projeto, 2 projetos grátis, 5 GB de egress. Projeto com **pouca atividade em 7 dias é pausado**; aviso por e-mail ~1 semana antes; restauração pelo painel (_Resume project_) por até **1 ano** segundo esta página (outra página do Supabase diz 90 dias: **assuma 90**). Uma escrita diária (o reset da demo) mantém o projeto ativo.                                                                                                                                                                                                              | [Pausa de projetos](https://supabase.com/docs/guides/platform/free-project-pausing), [Planos e cobrança](https://supabase.com/docs/guides/platform/billing-on-supabase)                         |
| **Vercel Hobby**                | **Só uso pessoal e não comercial.** 100 GB de transferência rápida, 1 milhão de requisições de CDN e de invocações de função por mês; função até 300 s; **100 deploys por dia**; _Runtime Logs_ de **1 hora**; deploy hooks: 5 por projeto e 60 disparos por hora; passou do limite, espere ~30 dias.                                                                                                                                                                                                                                                               | [Hobby](https://vercel.com/docs/plans/hobby) (atualizada em 14/09/2026), [Deploy Hooks](https://vercel.com/docs/deploy-hooks)                                                                   |
| **GitHub Actions**              | Em repositório **público**, workflows **agendados** (o _Reset demo account_) são **desativados após 60 dias sem atividade** no repositório; reative em _Actions → Reset demo account → Enable workflow_.                                                                                                                                                                                                                                                                                                                                                            | [Disable and enable workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)                                                                    |
| **Gemini (sua chave)**          | Cotas diárias de requisições, **informadas por você**: `3.5 flash`/`flash-lite` **500/dia**; `3.6` e `3.8` **20/dia**. Estourou: o app usa o heurístico e avisa.                                                                                                                                                                                                                                                                                                                                                                                                    | (informação sua; confira no Google AI Studio)                                                                                                                                                   |

---

## Quando terminar

Responda **"deploy confirmado"** (ou diga em qual passo travou e cole o erro, **sem segredos**). **Não vou começar a fase 11 antes disso.**
