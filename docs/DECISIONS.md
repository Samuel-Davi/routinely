# Decisões de arquitetura (ADRs)

Formato curto: **contexto → decisão → consequência**.

## ADR-001 — Validação de DTO com zod (não class-validator)

- **Contexto:** a API, os formulários do front e a saída estruturada da IA precisam das mesmas regras.
- **Decisão:** os schemas zod de `packages/shared` são a única fonte de verdade. A API usa um `ZodValidationPipe` próprio e gera o Swagger a partir dos mesmos schemas (`z.toJSONSchema`). Um pipe de ~10 linhas evita mais uma dependência (`nestjs-zod`) entre o zod 4 e o Nest.
- **Consequência:** nenhuma regra duplicada; sem decorators de `class-validator` nos DTOs.

## ADR-002 — Modelo de tempo

- **Contexto:** compromissos são recorrentes ("toda segunda 08:00"), blocos de rotina são instantes.
- **Decisão:** blocos são guardados em UTC (`timestamptz`). Compromissos fixos guardam `daysOfWeek` (0 = domingo … 6 = sábado) + `startTime`/`endTime` em `"HH:mm"` no fuso do usuário (`Preferences.timezone`, padrão `America/Manaus`). Toda alocação cai numa grade de **15 minutos**. As conversões ficam em `packages/shared/src/time.ts` (`date-fns` + `@date-fns/tz`).
- **Consequência:** trocar de fuso não exige migrar dados; durações são sempre múltiplas de 15.

## ADR-003 — Jobs de IA in-process com estado no banco

- **Contexto:** estimar tarefa e gerar rotina são assíncronos; fila/Redis está fora do escopo do MVP.
- **Decisão:** os endpoints respondem imediatamente e o trabalho roda no processo da API. O estado fica em `Task.estimationStatus` e `Routine.status` (`PENDING | READY/DONE | FAILED`); o front faz polling com TanStack Query.
- **Consequência:** um restart da API interrompe jobs em andamento — no boot, itens `PENDING` órfãos são reprocessados (estimativas) ou marcados como `FAILED` (rotinas). Evolução natural: fila persistente.

## ADR-004 — Rotina versionada

- **Decisão:** cada geração/replanejamento/restauração cria uma `Routine` (versão) com seus `RoutineBlock`s; só uma é `active`. Ajustes manuais alteram a versão ativa e marcam o bloco como `locked`. Restaurar copia os blocos de uma versão antiga para uma nova versão, descartando os que conflitam com o estado atual. O `diffSummary` (adicionados/removidos/movidos) é calculado de forma determinística contra a versão anterior.
- **Consequência:** histórico imutável e restauração segura.

## ADR-005 — A IA propõe, o backend valida

- **Decisão:** pipeline `janelas livres (determinístico) → LLM → validador`. Se a resposta for inválida: 1 retry com o modelo de retry e a lista de erros. Depois disso, as alocações válidas são mantidas **por tarefa** (somente quando o total alocado é exatamente o estimado) e o restante é completado pelo heurístico (ordenar por deadline/prioridade/complexidade, first-fit). Erro de provedor (429 após 3 tentativas com backoff + jitter, timeout, chave ausente) → heurístico puro. `Routine.source` registra `AI | AI_REPAIRED | HEURISTIC` e o front sinaliza "rotina gerada sem IA".
- **Consequência:** o app nunca fica sem rotina e nenhuma alocação inválida é persistida.

## ADR-006 — Tarefas impossíveis não são alocadas

- **Decisão:** tarefa que não cabe antes do deadline (ou é maior que o bloco máximo e não é divisível) não é agendada depois do prazo; entra em `Routine.unscheduled` com o motivo e a UI avisa.

## ADR-007 — Override manual da estimativa

- **Decisão:** `Task.estimationSource` = `AI | MANUAL | HEURISTIC`. Valores definidos pelo usuário nunca são sobrescritos por uma re-estimativa. O resultado de `estimateTask` é cacheado em `EstimateCache` por `sha256(título + descrição + prioridade)`.

## ADR-008 — Versões fixadas por compatibilidade

- **NestJS 11 (linha `legacy`, mantida):** o NestJS 12 é ESM-only e seu template usa Vitest; como o requisito é Jest na API, a linha 11 (CommonJS) é o caminho estável com Jest + ts-jest.
- **Prisma 6.x:** é a major que mantém `url`/`directUrl` no `schema.prisma` (requisito para a troca para Supabase).
- **TypeScript 6.0:** `typescript-eslint` e `@nestjs/swagger` ainda não aceitam TS 7.
- **`@dnd-kit/core` 6:** API estável (a nova `@dnd-kit/react` ainda é 0.x).

## ADR-009 — `packages/shared` compilado em ESM + CJS

- **Decisão:** build com `tsup` gerando os dois formatos, para ser consumido pelo Nest (CommonJS) e pelo Next (ESM) sem transpilar em cada app.

## ADR-010 — Motion e drag & drop

- **Decisão:** `motion` para molas (criticamente amortecidas por padrão; leve bounce apenas ao soltar um arrasto ou em sheets) e `@dnd-kit` para arrastar/redimensionar. `prefers-reduced-motion`, `prefers-reduced-transparency` e `prefers-contrast` são tratados nos tokens e primitivos de UI.
