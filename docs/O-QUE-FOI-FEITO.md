# Routinely — o que foi feito

Registro do que foi construído, em que ordem, o que foi verificado e o que ficou pendente. Para rodar o projeto, veja o [`README.md`](../README.md); para o porquê de cada decisão, veja [`DECISIONS.md`](DECISIONS.md).

## Resumo

O Routinely foi construído do zero em um repositório vazio: um monorepo pnpm com API NestJS, front Next.js e um pacote de schemas compartilhados. O app gera uma rotina semanal a partir de compromissos fixos e tarefas com prioridade e prazo.

A regra central é **a IA propõe, o backend valida**: nenhuma alocação é salva sem passar por um validador determinístico, e um planejador heurístico garante que sempre exista rotina, mesmo sem IA.

O trabalho foi feito em 13 fases, com um commit por fase (14 commits no total, porque a última fase foi dividida em CI e documentação). Ao fim de cada fase, lint, typecheck e testes passavam.

## O que não foi verificado

- **Gemini real:** não havia chave de API. A integração foi testada apenas com o SDK mockado, e tudo que rodou no navegador usou o planejador sem IA.
- **CI no GitHub:** o repositório não tem remoto, então o workflow nunca rodou lá. A mesma sequência de comandos foi executada em um clone limpo e as duas imagens Docker foram construídas localmente.
- **Toque em aparelho físico:** o arrasto e o swipe foram testados com mouse e em viewport de celular emulada.

## Fases e commits

| #   | Commit                                 | O que entrou                                                                                                                        |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `2f8fde1` chore: bootstrap monorepo    | pnpm workspaces, TypeScript strict, ESLint, Prettier, husky + lint-staged, ADRs iniciais                                            |
| 1   | `d920b3f` feat(shared)                 | Schemas zod, enums, utilitários de tempo com fuso e a checagem de posicionamento de bloco                                           |
| 2   | `14778fd` feat(api): foundation        | NestJS, config de ambiente validada, Prisma (schema, migration, seed), logging estruturado, filtro global de erros, Swagger, health |
| 3   | `976b433` feat(api): CRUD              | Módulos de compromissos fixos, tarefas e preferências, com testes unitários e e2e                                                   |
| 4   | `4de0a60` feat(api): camada de IA      | `LlmProvider`, `GeminiProvider`, stubs Anthropic/Ollama, cliente com backoff e retry, prompts, `estimateTask` com cache             |
| 5   | `eb95c2a` feat(api): motor de rotina   | Janelas livres, validador, heurístico, diff e orquestração, tudo em funções puras                                                   |
| 6   | `ff9641e` feat(api): rotinas           | Gerar, replanejar, mover/redimensionar, concluir, sugestão de replanejamento, histórico e restauração                               |
| 7   | `8a23b28` feat(web): fundação          | Next.js, tokens de design, primitivos de UI, cliente HTTP tipado, QueryClient, store Redux, setup de testes                         |
| 8   | `5220b19` feat(web): telas de cadastro | Compromissos, tarefas e preferências                                                                                                |
| 9   | `3f7def4` feat(web): calendário        | Grade semanal, visão diária, navegação, filtros                                                                                     |
| 10  | `a2838b5` feat(web): fluxo da rotina   | Gerar/replanejar com polling, drag & drop, detalhes do bloco, histórico                                                             |
| 11  | `7a804c4` build: Docker                | Dockerfiles multi-stage, compose completo, override de desenvolvimento                                                              |
| 12  | `c5fcc0a` ci + `f8be576` docs          | Workflow do GitHub Actions, README, guia do Supabase, ADRs finais                                                                   |

## Funcionalidades entregues

### Compromissos fixos

- CRUD com título, dias da semana, hora de início e fim, categoria e cor.
- Qualquer alteração marca a rotina como possivelmente desatualizada.

### Tarefas

- CRUD com título, descrição, prioridade, prazo e status.
- Ao criar ou editar, a IA estima complexidade (1 a 5), duração, se é divisível e uma justificativa curta. A estimativa roda em segundo plano e a tela mostra o estado enquanto espera.
- O usuário pode sobrescrever a estimativa. Um valor manual nunca é substituído por uma nova estimativa da IA, a menos que ele peça.
- Estimativas idênticas (mesmo título, descrição e prioridade) vêm de um cache, sem gastar cota.
- Se a IA estiver indisponível, a tarefa recebe uma estimativa heurística marcada como "Estimativa sem IA".

### Preferências

- Janela diária, horário protegido de almoço/descanso, duração máxima de bloco de foco, intervalo mínimo entre blocos e fuso horário.

### Gerar rotina

- Planeja a semana selecionada ou, opcionalmente, até o último prazo, com teto de 4 semanas.
- A geração roda como um job: a API responde na hora e o front acompanha por polling.
- A origem da rotina fica registrada e é exibida: com IA, IA com correção automática ou sem IA.
- Tarefas que não cabem antes do prazo não são agendadas depois dele: aparecem em uma lista com o motivo.

### Calendário

- Grade semanal com compromissos, almoço, blocos de tarefa e linha do horário atual.
- Navegação entre semanas e botão "Hoje".
- No celular vira visão diária, com abas de dia e swipe lateral.
- Filtros por prioridade e por blocos concluídos.

### Ajuste manual

- Arrastar para mover e puxar a borda inferior para redimensionar.
- O conflito é mostrado durante o arrasto, com a mesma função de validação que a API usa.
- A mudança aparece na hora e é desfeita se o servidor recusar.
- Blocos movidos ficam travados. É possível travar e destravar pelos detalhes do bloco.
- Os detalhes do bloco têm um formulário de dia, início e fim, que serve de caminho pelo teclado.

### Replanejar

- Regenera apenas o futuro e mantém blocos travados e concluídos.
- Um aviso sugere replanejar quando há blocos atrasados, tarefas novas ou alteradas, ou mudança em compromissos e preferências.

### Concluir e histórico

- Concluir ou reabrir um bloco; a tarefa é concluída junto com o último bloco.
- Cada geração, replanejamento ou restauração cria uma versão, com data, origem e resumo das mudanças.
- Restaurar uma versão antiga traz de volta só os blocos que ainda são válidos.

## Como a IA foi integrada

- A interface `LlmProvider` é o único ponto de contato com um fornecedor de LLM.
- O `GeminiProvider` pede JSON restrito por um schema gerado dos schemas zod e valida a resposta com zod.
- O `LlmClient` trata limite de uso (429) com backoff exponencial e jitter, até 3 tentativas, e faz um único retry no modelo de retry quando a resposta não passa na validação.
- Os prompts ficam em arquivos versionados, em português, com exemplos.
- A chave de API nunca é logada. Os endpoints que disparam IA têm rate limit.
- `AnthropicProvider` e `OllamaProvider` são stubs: o roteiro de implementação está no comentário de cada arquivo.

### Pipeline de geração

1. Tarefas que não cabem nem com a agenda vazia são separadas de início e nunca chegam à IA.
2. A IA propõe as alocações.
3. O validador mantém apenas as tarefas totalmente válidas.
4. Se houver problemas, ocorre um retry com o modelo de retry e a lista de erros.
5. O heurístico aloca o que ainda faltou.

O validador rejeita qualquer bloco que:

- sobreponha compromisso fixo, almoço ou outro bloco;
- saia da janela diária ou do período planejado;
- termine depois do prazo;
- exceda o bloco máximo ou desrespeite o intervalo mínimo;
- divida uma tarefa indivisível;
- some um total diferente do estimado.

## Stack

| Parte         | Tecnologias                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| Front         | Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query, Redux Toolkit, react-hook-form, dnd-kit, motion |
| API           | NestJS 11, Prisma 6, PostgreSQL 16, `@google/genai`, pino                                                          |
| Compartilhado | zod 4, date-fns                                                                                                    |
| Testes        | Vitest, Testing Library, MSW, Jest, supertest                                                                      |
| Infra         | Docker Compose, GitHub Actions                                                                                     |

No front, o TanStack Query guarda tudo que vem da API, e o Redux guarda só estado de interface: semana e dia selecionados, modo de visão, filtros, estado do arrasto, painéis abertos e rascunhos.

## Verificação

### Testes automatizados

| Pacote                 | Testes |
| ---------------------- | ------ |
| `packages/shared`      | 50     |
| `apps/web`             | 96     |
| `apps/api` (unitários) | 184    |
| `apps/api` (e2e)       | 39     |

- O motor de rotina tem 100% de cobertura.
- Um teste de propriedade roda 300 cenários com respostas aleatórias da "IA" e confere todas as regras no resultado.
- Nenhum teste chama um LLM real.

### Verificação manual

- Com o volume do banco apagado, `docker compose up --build` subiu os três serviços com healthcheck, aplicou a migration e carregou o seed. Os containers rodam como usuário não-root.
- O fluxo completo foi percorrido no navegador contra as imagens de produção, sem erros no console: criar compromisso, criar tarefa, gerar rotina, arrastar um bloco, replanejar (o bloco travado ficou no lugar), concluir, abrir o histórico e restaurar a versão 1.
- Arrastar para cima de um compromisso ou para depois do prazo mostrou o conflito durante o arrasto e não moveu o bloco.
- As telas foram conferidas em desktop e celular, nos temas claro e escuro.
- A sequência do CI (install com lockfile congelado, lint, typecheck, testes, e2e e build) passou em um clone limpo.

## Skills

| Skill                      | Uso                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `apple-design`             | Toda a UI: tipografia, materiais translúcidos, molas, feedback no toque, movimento reduzido |
| `find-skills`              | Busca e instalação das demais                                                               |
| `gemini-api-dev`           | Lista de modelos atuais do Gemini; o uso do SDK veio dos tipos instalados                   |
| `github-actions-hardening` | Ações fixadas por SHA e token só de leitura                                                 |

Outras nove foram instaladas no projeto, mas não chegaram a ser consultadas: React/Next da Vercel, TanStack Query, Redux Toolkit, NestJS, três do Prisma, testes JS, Jest, Dockerfile multi-stage e prompt engineering. Todas ficam em `.claude/skills`, fora do git.

## Decisões que fogem do pedido original

- **NestJS 11, não 12:** o 12 é ESM-only, o que tornaria o Jest (exigido na API) frágil.
- **TypeScript 6.0 e Prisma 6:** o TS 7 ainda não é aceito pelo typescript-eslint, e o Prisma 6 é a versão que mantém `url` e `directUrl` no `schema.prisma`.
- **Estimativa sem IA em vez de erro:** sem isso o app não funcionaria de ponta a ponta sem chave.
- **Jobs de IA no próprio processo da API**, com estado no banco e polling no front, sem fila.
- **DTOs validados com zod**, usando os mesmos schemas nos formulários e na saída da IA.
- **Semana de segunda a domingo.**
- **Ajuste manual só bloqueia conflitos reais:** o intervalo mínimo entre blocos e o total estimado valem para o planejador, não para quem arrasta.
- **Extras não pedidos:** formulário de horário nos detalhes do bloco (caminho de teclado) e botão de travar/destravar.

## Problemas encontrados no caminho

- **Cabeçalho dos dias deslocado:** o cabeçalho fixo do calendário aparecia fora do lugar por causa de um `overflow: hidden` no cartão. Corrigido.
- **Clique ignorado depois de redimensionar:** o bloco deixava de abrir os detalhes após um redimensionamento. Corrigido.
- **Blocos de 15 minutos soltos:** o heurístico deixava "restos" de 15 minutos ao dividir tarefas. Agora ele prefere pedaços de pelo menos 30 minutos e só usa 15 quando é o que faz a tarefa caber.
- **Seletor Semana/Dia no celular:** aparecia quando deveria ficar oculto. Corrigido.

## Pendências e riscos

- **Nome do modelo de retry:** `GEMINI_RETRY_MODEL=gemini-3.6-flash` foi mantido como especificado, mas a referência oficial consultada lista `gemini-3.8-flash` e `gemini-3.5-flash-lite` e não menciona o 3.6. Se o nome não existir, o retry falha e o app usa o planejador sem IA.
- **Restart durante uma geração:** a rotina fica como "Falhou" e é preciso gerar de novo.
- **Edição durante uma geração:** um bloco movido enquanto a rotina está sendo gerada pode não entrar na nova versão.
- **Imagem da API com cerca de 750 MB**, porque inclui a CLI do Prisma para rodar as migrations no start.
- **Anthropic e Ollama** são stubs, não implementados.
- **Sem autenticação:** existe um único usuário de seed. A API não deve ser exposta publicamente antes de adicionar login. O caminho para o Supabase Auth está em [`SUPABASE.md`](SUPABASE.md).

## Próximos passos sugeridos

1. Colocar `GEMINI_API_KEY` no `.env`, confirmar o nome do modelo de retry e fazer um teste real de estimativa e de geração.
2. Criar o remoto no GitHub e fazer push para rodar o CI.
3. Testar o arrasto e o swipe em um celular de verdade.
