---
name: Routinely
description: A calm, light weekly planner at the category standard of Sunsama and Motion, with one indigo accent and the AI's work made visible.
colors:
  canvas: '#f6f7f9'
  surface: '#ffffff'
  surface-raised: '#ffffff'
  fill: 'rgb(16 24 40 / 0.05)'
  fill-strong: 'rgb(16 24 40 / 0.09)'
  label: '#15171c'
  label-secondary: '#4a5060'
  label-tertiary: '#5c6271'
  separator: 'rgb(16 24 40 / 0.12)'
  hairline: 'rgb(16 24 40 / 0.07)'
  shell: '#fbfbfc'
  accent: '#4f46e5'
  accent-hover: '#4338ca'
  accent-text: '#4338ca'
  accent-soft: 'rgb(79 70 229 / 0.1)'
  on-accent: '#ffffff'
  success: '#15803d'
  warning: '#b45309'
  danger: '#c81e1e'
  scrim: 'rgb(16 24 40 / 0.36)'
  canvas-dark: '#0e1014'
  surface-dark: '#16181d'
  surface-raised-dark: '#1c1f26'
  shell-dark: '#121418'
  label-dark: '#ececf0'
  label-secondary-dark: '#aeb2bd'
  label-tertiary-dark: '#969aa6'
  accent-dark: '#5b5ef0'
  accent-text-dark: '#a5a8ff'
  tone-blue: '#2563eb'
  tone-green: '#16a34a'
  tone-orange: '#d96706'
  tone-purple: '#7c3aed'
  tone-pink: '#db2777'
  tone-teal: '#0d9488'
  tone-red: '#dc2626'
  tone-gray: '#6b7280'
typography:
  display:
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '1.875rem'
    fontWeight: 700
    lineHeight: '2.125rem'
    letterSpacing: '-0.022em'
  title:
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '1.375rem'
    fontWeight: 700
    lineHeight: '1.75rem'
    letterSpacing: '-0.015em'
  headline:
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 600
    lineHeight: '1.375rem'
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 400
    lineHeight: '1.375rem'
    letterSpacing: '0em'
  footnote:
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 500
    lineHeight: '1.125rem'
    letterSpacing: '0.005em'
  caption:
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: '1rem'
    letterSpacing: '0.01em'
    fontFeature: 'tnum'
rounded:
  inset: '6px'
  control: '8px'
  card: '12px'
  sheet: '16px'
  full: '9999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  2xl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 16px'
    height: '44px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.fill}'
    textColor: '{colors.label}'
    rounded: '{rounded.control}'
    padding: '0 16px'
    height: '44px'
  button-secondary-hover:
    backgroundColor: '{colors.fill-strong}'
  button-ghost:
    textColor: '{colors.accent-text}'
    rounded: '{rounded.control}'
    padding: '0 16px'
    height: '44px'
  input:
    backgroundColor: '{colors.fill}'
    textColor: '{colors.label}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '44px'
  segmented-control:
    backgroundColor: '{colors.fill}'
    rounded: '{rounded.control}'
    padding: '2px'
  segmented-option-selected:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.label}'
    typography: '{typography.footnote}'
    height: '44px'
  nav-item:
    textColor: '{colors.label-secondary}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '44px'
  nav-item-active:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent-text}'
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
    padding: '12px 16px'
  task-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.label}'
    typography: '{typography.footnote}'
    rounded: '{rounded.control}'
    padding: '10px'
  task-block:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.label}'
    typography: '{typography.caption}'
    rounded: '{rounded.inset}'
  event:
    typography: '{typography.caption}'
    rounded: '{rounded.inset}'
    padding: '4px 8px'
  badge:
    typography: '{typography.caption}'
    rounded: '{rounded.full}'
    padding: '0 8px'
    height: '24px'
---

# Design System: Routinely

## Overview

**Creative North Star: "The Calm Planner"**

Routinely sits in the category Sunsama and Motion define, and it meets that category at their craft level rather than inventing a metaphor of its own. A light, airy product UI: a cool near-white canvas, white surfaces lifted by soft two-layer shadows, 8 to 12 px corners, and a single indigo accent. The week has to read at a glance, so the grid recedes (hairlines, quiet hour labels) and the content carries the colour: commitments as soft tinted events in their own colour, tasks as white cards with a check circle.

Familiarity is the point. Nothing is decorative; every coloured pixel means something (a commitment's colour, the one action, the current selection, now). The AI's work is made visible through structure, not ornament: a result card that states what changed, and an indigo ring that holds on the cards a run just placed or moved. The dark theme is the same structure on graphite surfaces, a token swap rather than a second design.

Scope, recorded honestly: the shell (sidebar, phone top bar and tab bar) and the week screen were redesigned for this world. Tarefas, Compromissos, Histórico, Ajustes, the sheets and the auth screens inherit the tokens and primitives below but have not yet been composed against this direction. The previous "Mapa do metrô" transit world was rejected by the user and is fully replaced; nothing of it is part of this system.

**Key Characteristics:**

- Light by default, with dark and system themes chosen in the app.
- One indigo accent; every other hue belongs to a commitment.
- White cards on a near-white canvas, separated by soft shadow plus a 1px ring, not by heavy borders.
- Inter for everything, tabular numerals for every time and count.
- Every control is at least 44px tall; nothing is smaller than 12px.
- Calm motion: instant press feedback, one arrival per run, nothing moves under reduced motion.

## Colors

A neutral, cool-grey product palette with one saturated indigo voice and eight commitment tones that only ever appear as tints, dots and ink.

### Primary

- **Indigo** (`accent`): the primary action ("Gerar rotina"), today's date disc, the selected day on phones, the done check, the run ring and the wordmark tile. In dark theme it brightens (`accent-dark`) so it holds against graphite.
- **Indigo Ink** (`accent-text`): indigo as text and as the focus ring, a step deeper than the fill in light theme and much lighter in dark (`accent-text-dark`) to keep AA contrast.
- **Indigo Wash** (`accent-soft`): the active sidebar row's background, a 10% indigo veil (16% in dark).

### Neutral

- **Cool Canvas** (`canvas`): the page behind everything; also the browser theme colour.
- **Paper White** (`surface`, `surface-raised`): cards, the calendar, task cards, menus and sheets. In dark theme the two separate into `surface-dark` and `surface-raised-dark` so raised things read as lighter.
- **Shell White** (`shell`): the sidebar, a hair off white so the navigation recedes from the content.
- **Ink** (`label`), **Slate** (`label-secondary`), **Muted Slate** (`label-tertiary`): primary text, supporting text, and hour labels, placeholders and the empty check circle. All three pass AA on the canvas.
- **Wash** (`fill`, `fill-strong`): the background of secondary buttons, inputs, segmented tracks, the open-tasks column, the lunch and travel bands, and their hover state.
- **Hairline** (`hairline`) and **Separator** (`separator`): grid lines and card dividers at 7%; control outlines and translucent-bar edges at 12%.

### Commitment tones

Eight tones (`tone-blue`, `tone-green`, `tone-orange`, `tone-purple`, `tone-pink`, `tone-teal`, `tone-red`, `tone-gray`), each with a lighter dark-theme counterpart in the sidecar. A commitment owns one; its tasks carry it as a dot. Gray marks tasks with no commitment ("Sem compromisso").

### Status

- **Success** (`success`), **Warning** (`warning`), **Danger** (`danger`): result-card outcomes, "não couberam" counts, overdue deadlines, the "Urgente" word, destructive actions, and the now-line.

### Named Rules

**The One Indigo Rule.** Indigo means "act here, you are here, or this just changed": the primary action, focus, selection, today, and the run ring. It is never a commitment colour in disguise and never decoration.

**The Tint, Not Fill Rule.** On the grid, a commitment's colour is a tint of the surface (13% in light, 16% in dark) with text in its ink (62% / 82% of the tone mixed into the label colour). Solid tone fills are reserved for dots and small markers.

**The Word, Not Colour Rule.** Urgency is a word ("Urgente" in danger red, "Alta" in secondary text), never a card colour. A task card is always white.

## Typography

**Body Font:** Inter (variable, self-hosted from `apps/web/src/app/fonts`, SIL OFL), falling back to the system UI stack.

**Character:** the category's workhorse UI face, used alone. Hierarchy comes from size, weight and tight negative tracking at the top of the scale, never from a second family.

### Hierarchy

- **Display** (700, 30px / 34px, -0.022em): the page title, e.g. the week range "23 – 29 de nov. de 2026". Steps down to Title on phones.
- **Title** (700, 22px / 28px, -0.015em): page titles on phones and section heads.
- **Headline** (600, 17px / 22px, -0.01em): card titles (result card, "Tarefas abertas"), the wordmark, day numbers in the grid header.
- **Body** (400 to 600, 15px / 22px): default copy, buttons, nav rows, inputs, menu items.
- **Footnote** (500 to 600, 13px / 18px): supporting lines, field labels, segmented options, task-card titles in the column, group heads.
- **Caption** (500 to 600, 12px / 16px, 0.01em): event and task-block text on the grid, hour labels, duration chips, badges, tab-bar labels.

### Named Rules

**The Caption Floor Rule.** Nothing in the UI is smaller than Caption (12px). Short grid cards drop lines, not type size.

**The Tabular Time Rule.** Every time, range, count and duration uses tabular numerals so columns of times align.

## Layout

A product shell, not a page. On wide screens a fixed left sidebar (240px) holds the wordmark, five icon-and-label destinations (Semana, Tarefas, Compromissos, Histórico, Ajustes), and at its foot the theme switch and the account. Content sits to its right with a 24px gap, a 32px right gutter on large screens, and a 1536px maximum width.

On phones the sidebar becomes a slim translucent top bar (56px: wordmark, theme cycle button, account) and a translucent bottom tab bar (64px plus the safe-area inset) holding the same five destinations within thumb reach. Content gutters are 16px, 24px from `sm`.

The week screen composes as: a page header (title left; Semana/Dia segmented, ‹ Hoje › stepper, Replanejar, the indigo primary and an overflow menu right), the result or status card, then the open-tasks column beside a seven-day grid. The grid is one white card: a sticky day header, a 48px hour axis, and 56px per hour with hairline rules; lunch and travel windows are washed bands labelled in caption text. Phones show one day with a day-picker row above it.

Spacing follows a 4px base: 4 and 8px inside cards and lists, 12 to 16px for card padding and between cards, 24px between page sections.

## Elevation & Depth

Soft, layered and shallow. Surfaces separate from the canvas by a two-layer shadow that pairs a faint drop with a 1px ring, so a card has an edge without a drawn border. Three levels:

- **Card** (`0 1px 2px rgb(16 24 40 / 0.06), 0 0 0 1px rgb(16 24 40 / 0.06)`): the calendar, the result card, task cards, task blocks, the selected segment.
- **Raised** (`0 2px 6px rgb(16 24 40 / 0.08), 0 0 0 1px rgb(16 24 40 / 0.06)`): hover on task cards.
- **Float** (`0 16px 40px rgb(16 24 40 / 0.14), 0 2px 8px rgb(16 24 40 / 0.06)`): menus, sheets, toasts, a block being dragged.

Dark theme keeps the same three levels with deeper black drops and a white 6 to 8% ring. Translucent chrome (phone bars, toasts) uses a blurred material at 82% white (86% graphite in dark), which becomes solid under reduced transparency or increased contrast.

### Named Rules

**The Ring, Not Border Rule.** A card's edge is the 1px ring inside its shadow, never a separate border. Borders are for dividers inside a card (`hairline`) and for control outlines (`separator`).

## Shapes

Gently rounded, nested consistently: 6px for things that sit inside a card (events, task blocks, the theme switch's segments), 8px for controls and task cards, 12px for cards and the calendar, 16px for sheets. Fully round for icon buttons, badges, the today disc, check circles and commitment dots. The check circle is a 1.5px outline in `label-tertiary`; done fills it indigo with a white check.

Icons are a single in-house set of 24px-grid stroke icons (rounded caps and joins), drawn at 16 to 22px.

## Components

### Buttons

Quiet, compact and tactile; one loud button per screen.

- **Shape:** 8px corners, at least 44px tall at every size (sm 44px with 14px padding, md 44px with 16px, lg 48px with 20px).
- **Primary:** indigo fill, white label, an 18px leading icon; deepens on hover.
- **Secondary:** wash fill with ink label; stronger wash on hover. The default variant.
- **Ghost:** no fill, indigo-ink label; wash on hover.
- **Danger:** wash fill with danger-red label.
- **Icon button:** 44px circle, slate icon, wash on hover; always has an accessible name.
- **Press:** every pressable scales to 0.97 on press (100ms); under reduced motion it dims to 70% instead. Loading keeps the label and swaps the icon for a spinner.

### Segmented control

A wash track (8px corners, 2px inset) with 44px options; the selected one is a white raised segment with ink text and the Card shadow. Arrow keys move the selection. The sidebar theme switch is the same pattern with three icon segments (system, light, dark).

### Cards / Containers

- **Corner Style:** 12px.
- **Background:** Paper White.
- **Shadow Strategy:** Card level; the hairline ring is the edge.
- **Internal Padding:** 12px by 16px; rows inside are divided by hairlines.
- **The open-tasks column** is the exception: a 60% wash panel with no shadow, so the white task cards inside it lift.

### Inputs / Fields

- **Style:** wash fill, transparent 1px border, 8px corners, 44px tall, 12px side padding; label in footnote slate above, hint in footnote muted slate below.
- **Hover / Focus:** stronger wash on hover; on focus the field turns white with an indigo-ink border.
- **Error / Disabled:** danger-red border with a footnote error line; disabled at 50% opacity.

### Navigation

- **Sidebar rows:** 44px, 8px corners, 20px icon plus body-weight-500 label in slate; hover adds wash and ink. The current destination takes the indigo wash with indigo-ink text and icon.
- **Phone tab bar:** five equal tabs, 22px icon over a caption label; the current tab is indigo ink.
- **Wordmark:** a 26px indigo rounded tile with week rows and a check, beside "Routinely" in headline bold.

### Task card (signature)

A white card that reads as a to-do: an empty check circle, the title (footnote, up to two lines), then a caption meta row with the deadline ("em 4 dias", danger and bold when overdue) and a duration chip (4px-corner wash, e.g. "3h / 3h"). Grouped under a head that carries the commitment's dot, name and count. Hover raises it; picking it gives it the indigo ring and highlights its blocks on the grid.

### Task block and event (signature)

On the grid, a **task block** is the same idea compressed: a white 6px-corner card with the Card shadow, a 14px check circle and caption-semibold title, then the commitment dot and the time range. Short blocks keep only the title (and a lock if locked). Done blocks dim to 60% with a struck title and a filled indigo check. A conflict while dragging outlines the block in danger red.

An **event** (a fixed commitment) is a 6px-corner tint of its tone with the title in caption semibold and the time range beneath at 80% opacity. Events never carry a shadow; that is how they read as fixed and tasks read as movable.

**The now-line** is a 2px danger-red rule with a 10px dot at the left edge, drawn across today's column only.

### Result card (signature)

After a run, a white card replaces the status strip: a 32px circular outcome icon in a 15% tint of its tone, a headline title ("Semana em dia: nada mudou"), and a footnote line of tabular counts ("13 blocos · pelo planejador local", with "não couberam" in warning). Actions sit at the right (Desfazer, Ver o que mudou, Dispensar). Expandable detail opens beneath a hairline with a rotating chevron.

**The Run Ring.** The cards a run placed or moved arrive with a short rise (6px, from 40% opacity, 360ms, `cubic-bezier(0.16, 1, 0.3, 1)`, staggered 50ms per day) and then hold a 2px indigo ring outside a 2px surface gap for about four seconds. Kept blocks never move. Under reduced motion only the ring remains.

### Badges and toasts

Badges are 24px pills in a tone tint with caption-medium text and an optional 12px icon. Toasts are translucent pills with the Float shadow and a 16px status icon, above the tab bar on phones and bottom-centred on desktop.

## Do's and Don'ts

### Do:

- **Do** reference semantic tokens (`canvas`, `surface`, `label`, `accent`, `--tone`) and never raw hex, so light and dark stay a token swap.
- **Do** keep every interactive target at least 44px and every text at least 12px.
- **Do** give commitments their tone as a tint on the grid and as a dot on their tasks.
- **Do** use the two-layer Card shadow to separate white surfaces from the canvas.
- **Do** use tabular numerals for times, counts and durations.
- **Do** keep motion to instant press feedback (100 to 200ms) and one arrival per run, and remove movement under reduced motion.
- **Do** apply the saved theme before first paint (`data-theme` on `<html>`, choice in `localStorage` key `routinely:theme`, absent means system).

### Don't:

- **Don't** introduce a second accent or use indigo for anything but action, focus, selection, today and the run ring.
- **Don't** fill task cards with a colour; urgency is a word.
- **Don't** fill events with a solid tone or give them a shadow.
- **Don't** add a second typeface.
- **Don't** draw borders around cards; the shadow ring is the edge.
- **Don't** copy Sunsama's or Motion's logos, names, illustrations or exact brand colours; the category standard is the reference, not their assets.
