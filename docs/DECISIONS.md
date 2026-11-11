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

## ADR-011 — Server Components como casca, dados buscados no cliente

- **Contexto:** a API é um serviço separado, com URL pública (navegador) diferente da interna (rede do Docker), e quase toda tela é interativa.
- **Decisão:** `layout`, páginas, shell e metadados são Server Components; cada página rende **um** componente cliente de tela. Os dados são buscados no cliente com TanStack Query (cache, polling dos jobs de IA, optimistic updates).
- **Consequência:** sem pré-renderização de dados no servidor (aceitável para um app pessoal atrás de login futuro). Evolução: prefetch + `HydrationBoundary` com uma URL interna da API.

## ADR-012 — Semana de segunda a domingo

- **Decisão:** a rotina "da semana" cobre segunda → domingo (`startOfWeek` em `packages/shared`), que é como a semana de trabalho/estudo é planejada.

## ADR-013 — O que sobrevive a um replanejamento

- **Decisão:** blocos concluídos sempre ficam; um bloco em andamento fica; blocos não concluídos no passado são descartados (o tempo deles é replanejado); blocos futuros ficam se estiverem travados ou fora do período planejado; o resto é regenerado. Os minutos a alocar de cada tarefa são `estimado − já coberto pelos blocos mantidos`.
- **Restauração:** blocos concluídos voltam como estavam; blocos não concluídos só voltam se ainda forem válidos hoje (futuro, sem conflito, antes do prazo, tarefa ainda aberta). A quantidade descartada aparece no aviso da nova versão.

## ADR-014 — Ajuste manual: só conflitos reais bloqueiam

- **Decisão:** ao mover/redimensionar, valem as regras duras (compromissos, almoço, outros blocos, janela diária, prazo, bloco máximo, passado). O intervalo mínimo entre blocos e o total estimado da tarefa são critérios do planejador, não travas para o usuário. A mesma função `checkPlacement` roda no front (feedback durante o arrasto) e na API (fonte da verdade).
- **Teclado:** como alternativa acessível ao arrasto, os detalhes do bloco têm um formulário de dia/início/fim com a mesma validação.

## ADR-015 — Estimativa sem IA em vez de erro

- **Decisão:** se a IA estiver indisponível ao estimar uma tarefa (sem chave, 429 após as tentativas, resposta inválida após o retry), a tarefa recebe uma estimativa heurística marcada como `HEURISTIC` ("Estimativa sem IA"), com opção de pedir de novo ou ajustar manualmente. `FAILED` fica reservado a erros inesperados.
- **Motivo:** sem estimativa a tarefa não pode ser planejada; o app precisa funcionar de ponta a ponta mesmo sem chave de API.

---

# Pendências e riscos conhecidos

- **Modelo de retry do Gemini:** `GEMINI_RETRY_MODEL=gemini-3.6-flash` foi mantido como especificado, mas a referência oficial consultada lista `gemini-3.8-flash` e `gemini-3.5-flash-lite` como modelos atuais e não menciona `gemini-3.6-flash`. Se o nome não existir, o retry falha e o app cai no heurístico (comportamento seguro). Confirme o nome e ajuste a variável.
- **Sem chamada real ao Gemini nos testes:** a integração foi testada com o SDK mockado; falta um smoke manual com uma chave real (formato do `responseJsonSchema`, limites do free tier).
- **Jobs in-process (ADR-003):** um restart da API durante uma geração marca a rotina como `FAILED` (o usuário gera de novo). Com mais de uma instância da API, o rate limit e a fila de estimativas deixam de ser globais — use uma fila persistente.
- **Edição durante a geração:** blocos movidos manualmente enquanto um job está rodando podem não entrar na nova versão (o job usa um snapshot do início).
- **Imagem da API (~750 MB):** inclui a CLI do Prisma e seus engines para rodar `migrate deploy` no start. Dá para reduzir separando as migrations em um job próprio.
- **CI:** o workflow foi validado localmente (mesmos comandos e build das imagens), mas ainda não rodou no GitHub — o repositório não tem remoto configurado.
- **Provedores Anthropic/Ollama:** stubs documentados, não implementados.
- **Sem autenticação:** usuário único de seed; não exponha a API publicamente antes de adicionar login (ver `docs/SUPABASE.md`).
- **Drag & drop por toque:** usa pressionar-e-segurar (220 ms) para não brigar com o scroll; testado em emulação, não em aparelhos físicos.
