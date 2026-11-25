# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **The author, daily.** One person whose week mixes fixed anchors (internship, university, English course, gym) with a queue of tasks that have priority and deadline. They open the app to see this week, generate or replan it, mark blocks done, and adjust by hand. A local voice assistant (Jarvis) also reads today's schedule through the read-only `GET /integrations/today` route.
- **Portfolio evaluators.** Recruiters and engineers who enter through the shared demo account ("Entrar como demo", never calls the AI) and judge product and engineering quality in a few minutes.

## Product Purpose

Routinely turns fixed commitments plus a task list into a weekly routine. The AI proposes allocations, a deterministic validator decides what is saved, and a heuristic planner guarantees a routine even when the AI is unavailable. Success: the author trusts the week enough to follow it, and an evaluator understands the mechanism and its quality in one visit.

## Positioning

Transparency over magic. The AI proposes, the validator guarantees, and the app explains every block ("Por que este horário") and every task that did not fit, which is scheduled partially and flagged, never silently dropped. Motion, Reclaim and Sunsama place work automatically; Routinely shows its reasoning and its limits.

## Operating Context

- Weekly rhythm: Monday to Sunday, 15-minute grid, commitments in `HH:mm` in the user's time zone, blocks stored in UTC.
- Typical loop: add or update tasks, generate the week, check the calendar, drag or lock blocks, mark blocks done (task progress comes from completed blocks), replan only the future, restore an earlier version from Histórico.
- Used on desktop and on a phone (daily view with swipe).
- Demo mode resets daily; it uses the heuristic planner only, so the UI must make "rotina gerada sem IA" read as normal, not as failure.

## Capabilities and Constraints

- Features: fixed and one-off commitments, tasks with AI effort estimation and manual override, generate / replan, drag and drop with live conflict validation, lock blocks, version history with restore, preferences (daily window, lunch, focus block length, gaps, travel time), email + password accounts, daily AI quotas, portfolio mode, read-only personal API tokens.
- UI copy in pt-BR; code and commits in English.
- Every action has a 44px target (ADR-026); nothing in the UI is smaller than 12px; motion respects `prefers-reduced-motion`.
- Server state lives in TanStack Query, UI state in Redux Toolkit; zod schemas in `packages/shared` are the single source of truth.

## Brand Commitments

- Name: Routinely. No logo asset exists yet.
- Voice: plain, calm pt-BR; explain the why, avoid jargon ("planejador determinístico" is internal language).
- The project rule says UI follows the `apple-design` skill (interaction physics, restraint, accessibility).
- Visual standard (user decision, 2026-11-24): the app sits alongside **Sunsama** and **Motion**, and their craft is the bar: light, airy product UI, a left sidebar, white cards with soft shadows, task cards with a check circle and a duration, tinted calendar events, one accent (indigo). Original execution of that category standard; never their logos, names, illustrations or exact brand colours. A "Mapa do metrô" transit world was built and rejected by the user as not modern enough.
- Light, dark and system themes, switchable from the app.

## Evidence on Hand

- Screenshots before and after the phase-9 redesign: `docs/screenshots/before/`, `docs/screenshots/after/`, with audits in `audit.json`.
- Design notes: `docs/DESIGN-NOTES.md`; decisions: `docs/DECISIONS.md` (ADR-001 to ADR-030).
- No users, testimonials, metrics or press exist. Do not invent them.

## Product Principles

1. The routine is always there: AI failure degrades to the heuristic planner, never to an empty week.
2. Show the reasoning: every placement and every non-placement is explainable in the UI.
3. Nothing is lost silently: partial allocations are flagged, history keeps every version.
4. The common path first, the advanced one a level down, but frequent actions stay reachable.
5. A first-time evaluator should grasp the mechanism within one visit.

## Accessibility & Inclusion

44px targets, 12px minimum text, WCAG AA contrast, full keyboard access to sheets and menus, accessible names on calendar blocks, reduced motion, reduced transparency and increased contrast respected. Measured with `scripts/ui-audit.playwright.js`.
