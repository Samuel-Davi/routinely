# Routinely — guia para agentes

App que gera uma rotina semanal com IA a partir de compromissos fixos e tarefas. UI e textos em **pt-BR**; código, commits e símbolos em **inglês**.

## Regras que não mudam

- **A IA propõe, o validador decide, o heurístico é o fallback.** Nenhuma alocação é salva sem passar por `validateAllocations`. O app nunca fica sem rotina.
- **TanStack Query = server state. Redux Toolkit = UI state** (semana, modo de visão, filtros, arrasto, painéis, rascunhos). Nunca duplique dados da API no Redux.
- **Schemas zod em `packages/shared`** são a única fonte de verdade para DTOs, formulários e saída da IA.
- **Nenhum teste ou CI chama um LLM real.** Use `FakeLlmProvider` (`apps/api/src/testing`).
- TypeScript `strict`, sem `any`.
- O motor de rotina (`apps/api/src/routines/engine`) é puro e mantém 100% de cobertura (limite no `jest.config.ts`).

## Mapa

```
packages/shared   schemas zod, enums, tempo com fuso, checkPlacement (regras duras de um bloco)
apps/api          NestJS: controller → service → repository (Prisma)
  src/ai          LlmProvider, GeminiProvider, LlmClient (backoff/retry), prompts/*.md
  src/routines    engine/ (puro) + service (jobs, replanejar, histórico)
apps/web          Next.js App Router; features/{calendar,routine,tasks,commitments,preferences}
docs/             DECISIONS.md (ADRs), DEPLOY.md, SUPABASE.md, DESIGN-NOTES.md
```

## Comandos

```bash
pnpm db:up          # só o Postgres (Docker)
pnpm dev            # web :3000 + api :3001
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e       # API com supertest, banco routinely_test
pnpm build
docker compose up --build
```

Uma fase de trabalho só termina com lint, typecheck, testes e build passando. Um commit por fase, em Conventional Commits.

## Cuidados

- **Nunca rode `docker compose down -v`**: o volume local guarda dados reais do usuário. Faça backup com `pg_dump` em `backups/` (fora do git) antes de migrations arriscadas. Migrations devem ser aditivas.
- A chave do Gemini fica só no `.env` e nunca é logada nem impressa.
- Depois de mexer em `packages/shared`, rode `pnpm --filter @routinely/shared build` (a API e o typecheck do front usam o `dist`; os testes usam o código-fonte).
- Horários: blocos em UTC; compromissos em `HH:mm` no fuso do usuário; grade de 15 minutos; semana de segunda a domingo.
- Decisão nova → ADR curto em `docs/DECISIONS.md`.
- UI segue a skill `apple-design`. Para medir a interface, use `scripts/ui-audit.playwright.js` (alvos de toque, texto pequeno, movimento sob reduced-motion).
