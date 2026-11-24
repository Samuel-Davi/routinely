---
version: 1
slug: "src-features-routine-week-screen-tsx"
primary_target: "src/features/routine/week-screen.tsx"
related_targets: ["src/app/globals.css","src/components/shell/app-shell.tsx"]
---

# Semana (week screen)

Mode: Operate. Primary surface of the app; its world propagates to every screen through tokens and the shell.

Audience and job: the author plans and follows the week (generate, check, drag, lock, mark done); portfolio evaluators enter via the demo and must grasp the mechanism in one visit. Primary action: "Gerar rotina". Proof: the result card and the explanation behind every block ("Por que este horário", tasks that did not fit).

Approved AI-moment brief (shape, 2026-11-24): result card replaces the status strip after a job (title, "N blocos · N novos · N movidos · N não couberam", source "pela IA" / "pelo planejador local", Desfazer via restore of the previous version, Ver o que mudou, Dispensar); new and moved blocks arrive in sequence day by day and stay highlighted ~4 s, kept blocks never move; no-change state; demo heuristic is informative, real AI failure stays a warning; success toast removed; reduced motion keeps only the highlight. No API change.

User steer (2026-11-24, second round): the "Mapa do metrô" world was rejected as not modern enough. The user asked to adapt to Sunsama and Motion (canon path), with an indigo accent, a left sidebar, and a visible light / dark / system theme switch.

## Direction contract

THESIS: The category standard at the craft level of Sunsama and Motion: a calm, light planner where the week reads instantly and the AI's work is visible. It refuses decoration and invented metaphors; familiarity is the point.

OWN-WORLD: Near-white cool canvas, white surfaces with soft two-layer shadows, 8 to 12 px corners. One indigo accent for the primary action, focus and selection. Commitments as soft tinted events in their colour; tasks as white cards with a check circle, a duration chip and a coloured commitment dot. Inter for everything, tabular numerals. Dark theme: graphite surfaces, same structure.

STORY: The visitor sees the week, which tasks were placed and what did not fit, generates or replans, and undoes or adjusts.

FIRST VIEWPORT: Light left sidebar (wordmark, nav with icons, theme switch and account at the foot). Page header: week title, Semana/Dia segmented, ‹ Hoje ›, Replanejar, indigo "Gerar rotina". Result card above the grid; open-tasks column (cards grouped by commitment) left of a 7-day grid with tinted events and task cards; red now-line on today.

FORM: canon (standing exit), alongside Sunsama and Motion; seed: none (pinned) — "quero um design mais moderno ... pesquise o sunsama.com e o usemotion.com, se adapte no design deles". Signature interaction: after a run, new and moved task cards arrive and hold an indigo ring for about 4 s. Motion grammar: 150-200 ms transitions, one arrival per run, removed under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
