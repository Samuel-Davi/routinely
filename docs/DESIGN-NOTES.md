# Notas de design (fase 9)

Objetivo: a tela tinha informação demais. O redesign aplica **divulgação progressiva** e hierarquia
(princípios do `apple-design`: simplicidade ≠ minimalismo, feedback imediato, o caminho comum primeiro e o
avançado um nível abaixo) e corrige as falhas de acessibilidade achadas em teste real (A1, A2, A5, A6).

## Evidências

Screenshots em `docs/screenshots/before/` e `docs/screenshots/after/` (1440×900 e 390×844, claro e escuro) e as
medições em `before/audit.json` e `after/audit.json`, geradas por `scripts/ui-audit.playwright.js`.

| Medida (10 telas: 5 páginas × desktop e mobile)        | Antes |            Depois |
| ------------------------------------------------------ | ----: | ----------------: |
| Alvos de toque < 44 px (fora dos blocos do calendário) |   175 |             **0** |
| Elementos com texto < 12 px                            |   139 |             **0** |
| Elementos ainda animando sob `prefers-reduced-motion`  |   283 |             **0** |
| Regiões `navigation` com o mesmo rótulo                | 1 par |             **0** |
| Blocos do calendário com altura < 44 px                |    14 | 6 (ver "Exceção") |

Referências visuais: `before/semana-desktop-light.png` × `after/semana-desktop-light.png`,
`before/semana-mobile-dark.png` × `after/semana-mobile-dark.png`, `before/tarefas-desktop-light.png` ×
`after/tarefas-desktop-light.png`. O "antes" mostra 2 botões de ação, 3 controles de navegação, 2 faixas de
aviso e blocos de fundo cheio; o "depois" tem uma barra, uma ação primária, uma faixa de status e blocos
discretos.

## O que mudou

**Calendário**

- Bloco de tarefa: só título (truncado) e horário. A prioridade virou uma **linha lateral fina**
  (`3px`), não um fundo colorido; o cartão é neutro com borda de 1 px.
- Compromissos fixos em **tom neutro de baixo contraste**, com um ponto de cor para a categoria; sem borda
  tracejada. Almoço e deslocamento viraram faixas sutis (rótulo só quando há altura).
- Grade com linhas _hairline_ (`--hairline`), menos bordas e sombras.

**Cabeçalho (uma única barra)**

- Título da semana, navegação (‹ Hoje ›), **uma** ação primária ("Gerar rotina") e um menu "Mais opções"
  com visão semanal/diária, Filtros e Replanejar. Acabaram os dois botões lado a lado e a segunda linha de
  controles. O menu tem ponto indicador quando há filtros ativos.
- O menu é um componente novo (`components/ui/menu.tsx`): abre no foco do primeiro item, setas navegam,
  Escape fecha e devolve o foco, clique fora fecha.

**Avisos: uma faixa recolhível**

- "Rotina ajustada", "tarefas fora" e "replanejar" viram **uma** faixa ("2 avisos · Ver detalhes"). Os
  detalhes e as ações (Agora não, Replanejar, Ver tarefas) aparecem ao expandir.

**Tarefas**

- Cartão limpo: título, prazo, chip de prioridade e chip do compromisso. Estimativa, complexidade, origem da
  estimativa, justificativa da IA e status ficam em "Detalhes" (progressivo). O que precisa de atenção
  (estimando, falhou) continua visível.

**Tipografia e espaço**

- Corpo 15 px, metadados **≥ 12 px** (o 11 px foi removido em 7 lugares), no máximo 3 pesos (regular, médio,
  semibold, mais o bold do título), escala única de raio e espaçamento e uma cor de destaque.

**Acessibilidade**

- **A1:** todo controle interativo tem ≥ 44 px (botões, ícones, abas, alternadores, campos, o círculo de
  concluir tarefa tem alvo de 44 px com 24 px visuais).
- **A2:** sob `prefers-reduced-motion` as _transições_ também ficam em 0,01 ms (antes só as animações), então
  ficou 0 elemento em movimento; o feedback de pressionar vira mudança de opacidade.
- **A5:** as duas `navigation` agora se chamam "Principal" (barra superior) e "Abas" (barra inferior).
- **A6:** nenhum texto abaixo de 12 px.

**Mobile**: visão diária como padrão (já existia), tab bar com safe-area e os painéis continuam _sheets_.

## Exceção e limitações (sem maquiar)

- **6 blocos do calendário (visão semanal no desktop) têm altura < 44 px.** O tamanho do bloco é proporcional
  à duração (um bloco de 30 min tem ~28 px); aumentá-lo distorceria a grade. A largura é de > 100 px, e o
  mesmo bloco abre pelo teclado (Enter) e tem painel de detalhes. No celular (visão diária) a medição deu 0.
- O "antes" foi medido com dados reais de uso e o "depois" com a conta demo; a contagem de blocos
  depende dos dados, mas as regras medidas (alvo, texto, movimento) não.
- Não testado em aparelho físico (só emulação de viewport e `prefers-*` no Chromium).
- Um 401 inofensivo em `/auth/me` aparece no console logo após "Sair" (o menu consulta o usuário uma última
  vez antes de a página trocar).
