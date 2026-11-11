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

## ADR-016 — Blocos de pelo menos 30 minutos

- **Contexto:** em uso real apareceram blocos de 15 min. Todos vinham do heurístico: quando a passada de "pedaços ≥ 30 min" não fechava a tarefa, ele refazia a tarefa **inteira** com pedaços de 15, e compromissos em horários quebrados (08:15, 18:15) criavam janelas de 15 min que alimentavam isso.
- **Decisão:** ao dividir uma tarefa, o heurístico (1) usa pedaços ≥ 30 min; (2) encurta um bloco em vez de deixar uma sobra menor que 30 (90 + 15 vira 75 + 30); (3) só para os minutos que ainda não couberem, estica o bloco encurtado e então usa pedaços de 15. Blocos colados da mesma tarefa são fundidos se couberem num bloco de foco. No validador, uma proposta da IA com bloco < 30 min ao lado de outros blocos da mesma tarefa é rejeitada (`FRAGMENTED`) e a tarefa vai para o heurístico.
- **Consequência:** um bloco de 15 min só existe quando a tarefa inteira tem 15 min ou quando é o único jeito de ela caber antes do prazo. Ajustes manuais continuam livres.

## ADR-017 — Erros 5xx da IA são re-tentados

- **Contexto:** nos logs reais, o Gemini respondeu 503 várias vezes e a geração caía direto no heurístico.
- **Decisão:** além de 429, erros 5xx (tipo `OVERLOADED`) passam pelo mesmo backoff exponencial com jitter, até `LLM_MAX_ATTEMPTS`. Timeout (504) não é re-tentado, para não triplicar a espera.

---

## ADR-018 — Deslocamento como bloco reservado, sobreposição só avisa

Compromissos têm `requiresTravel` (padrão falso) e Ajustes tem `travelMinutes` (padrão 60; 0 desativa). Após o **último** compromisso do dia que exige deslocamento, `travelMinutes` viram um intervalo ocupado, recortado na janela diária. Ele entra em `computeFreeWindows` e em `checkPlacement` (`OVERLAPS_TRAVEL`), então vale para IA, heurístico e arrasto manual. Se o compromisso seguinte começa antes do fim do deslocamento, a UI mostra aviso. Compromissos fixos sobrepostos não são bloqueados: a API devolve `overlapsWith`, a UI avisa, e o planejador trata a união dos intervalos. Migration aditiva.

## ADR-019 — Tarefa vinculada a compromisso fixo

`Task.commitmentId` é opcional (FK com `onDelete: SetNull`: apagar a aula não apaga a tarefa). A API só aceita compromissos do próprio usuário. O vínculo serve a três usos: contexto compacto para a IA (só o título do compromisso na linha da tarefa), **sugestão** de prazo (próxima ocorrência; o usuário confirma com um botão, nunca é aplicada sozinha) e agrupamento/filtro na tela de tarefas (filtro no Redux, dados no TanStack Query). A migração dos dados antigos (sufixo "(Nome)" no título) é o script `pnpm --filter @routinely/api tasks:link`, com `--dry-run` por padrão e `--apply` explícito; títulos ambíguos (mais de um compromisso com o mesmo nome) são ignorados em vez de adivinhados.

## ADR-020 — Instrução rápida como dado não confiável, teto de tokens e modelos validados no boot

- **Instrução rápida** (≤ 40 palavras e ≤ 280 caracteres, vazia permitida) é validada no zod compartilhado (que também remove caracteres de controle e markup), no formulário (contador) e na API. No prompt ela vai **depois** das regras e dos dados, num bloco `PREFERENCIA_DO_USUARIO <<<…>>>` marcado como não confiável; o system prompt diz que ela nunca altera regras, IDs nem o formato. A defesa real não é o texto do prompt: é o validador, que rejeita qualquer saída que viole as regras (teste e2e de injeção com LLM mockado). A instrução não é gravada nem logada.
- **Payload compacto:** aliases `T1…`, janelas por dia, sem `rationale` anteriores. `LLM_MAX_INPUT_TOKENS` (padrão 12000, estimativa de ~3,5 caracteres por token) limita a entrada: as tarefas **menos urgentes** além do teto não vão para a IA e são encaixadas pelo heurístico em volta dos blocos da IA. Cada chamada loga `in=/out= tokens` (contagens do `usageMetadata`), nunca o conteúdo.
- **Modelos:** no boot a API lista os modelos da chave (`models.list`). Se `GEMINI_MODEL`/`GEMINI_RETRY_MODEL` não existirem, avisa no log, troca pelo Flash estável mais novo do mesmo tipo (flash-lite × flash) e expõe os avisos em `/ai/status`. Nunca impede a subida. Com a chave atual, `gemini-3.6-flash` existe (o receio do ADR de pendências não se confirmou); o Flash mais forte disponível é `gemini-3.8-flash`.

## ADR-021 — Estratégia de planejamento da IA escolhida por medição (comparação parcial)

**Decisão:** o padrão passa a ser `AI_PLANNING_STRATEGY=order-day`: a IA decide a **ordem** das tarefas e a **divisão em blocos** (com dia preferido); o backend escolhe os horários exatos (`placeByOrder`, puro e testado) e o validador continua sendo o árbitro final, com o heurístico completando o que sobrar. `times` (a IA propõe horários) e `order` continuam disponíveis por variável de ambiente.

**Como foi medido:** `pnpm eval:ai` (fora do CI, chave real, temperatura 0,2). 4 cenários fixos — a semana real do autor (aulas de seg a sáb, Web Academy, Jenkins/GitHub Actions), semana leve, semana lotada, prazos quase impossíveis com instrução do usuário — × 2 repetições = 8 execuções por linha. Modelo: `gemini-3.5-flash-lite`. "Sem IA" é o heurístico sozinho (1 execução por cenário).

| Modelo                | Estratégia | Execuções | Válido na 1ª | Precisou de fallback | Blocos < 30 min | Não encaixadas | Aderência | Tokens in/out | Latência | Execuções com erro | Descartadas (cota) |
| --------------------- | ---------- | --------: | -----------: | -------------------: | --------------: | -------------: | --------: | ------------: | -------: | -----------------: | -----------------: |
| (sem IA)              | heuristic  |         4 |            – |                 100% |             0.8 |            1.3 |       99% |         0 / 0 |    0.0 s |                  0 |                  0 |
| gemini-3.5-flash-lite | times      |         8 |          25% |                  75% |             0.4 |            1.4 |       85% |   3339 / 2795 |    9.4 s |                  1 |                  0 |
| gemini-3.5-flash-lite | order      |         8 |          50% |                  50% |             0.0 |            1.5 |       80% |    2559 / 803 |    7.2 s |                  1 |                  0 |
| gemini-3.5-flash-lite | order-day  |         8 |          50% |                  50% |             0.0 |            1.5 |       91% |   2755 / 1202 |   12.0 s |                  1 |                  0 |

**Leitura:**

- `order`/`order-day` acertam na 1ª tentativa o dobro de `times` (50% × 25%), geram ~3,5× menos tokens de saída (803–1202 × 2795) e não produziram bloco < 30 min (`times`: 0,4 por execução). `order-day` teve a melhor aderência à ordem prazo/prioridade (91% × 85% de `times` e 80% de `order`), ao custo de ~400 tokens de saída a mais.
- Escolhi `order-day` por aderência e fragmentação; a diferença de latência (12 s × 7 s de `order`) é ruído de 8 amostras e de picos 503 da API.
- A IA **não reduziu** as tarefas não encaixadas em relação ao heurístico (1,4–1,5 × 1,3). No cenário real o heurístico encaixou tudo, mas às custas de 3 blocos de 15 min; a IA deixa 1 tarefa de fora porque o validador é "tudo ou nada" por tarefa.

**O que NÃO foi medido (limitações):**

- **`gemini-3.6-flash` e `gemini-3.8-flash` não entram na tabela.** A cota diária deles é de apenas 20 requisições (a do 3.5 é 500); a primeira matriz esgotou o 3.6 e essas execuções (`RATE_LIMIT`) foram descartadas, e o 3.8 respondeu 503/504. Portanto a escolha do modelo forte de retry **não** é baseada em medição. O 3.6 segue como `GEMINI_RETRY_MODEL` por padrão, sem evidência.
- `GEMINI_THINKING_LEVEL` existe (opcional), mas o efeito sobre latência/qualidade não foi medido.
- Amostra pequena (n = 8 por linha): serve para descartar `times`, não para ranquear `order` × `order-day` com confiança. A "% válido na 1ª" é limitada por sobrecarga: nos cenários real e lotado sempre falta tempo para alguma tarefa, então nenhuma estratégia chega a 100%; vale a comparação relativa, não o valor absoluto.
- Rodar de novo quando a cota renovar: `pnpm eval:ai -- --models gemini-3.6-flash,gemini-3.8-flash --reps 1 --scenarios real,crowded` (≈ 6 execuções por modelo e estratégia, perto do limite de 20/dia: use uma estratégia por vez com `--strategies`).

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
