'use client';

import type { Routine } from '@routinely/shared';
import Link from 'next/link';
import { Fragment, useEffect, useId, useState, type ReactNode } from 'react';
import { Button, Icon, IconButton, Spinner, toneStyle, useToast } from '@/components/ui';
import { useMe } from '@/features/auth/api';
import { cn } from '@/lib/cn';
import { describeUnscheduled, replanReasonLabel } from '@/lib/labels';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import {
  runDismissed,
  runHighlightSet,
  selectDismissedSuggestionFor,
  selectLastRun,
  selectRunHighlight,
  suggestionDismissed,
} from '@/lib/store/ui-slice';
import { useReplanSuggestion, useRestoreRoutine, useStartRoutineJob } from './api';
import { describeRun, type RunResult } from './run-result';

/** How long the grid keeps the blocks a run added or moved highlighted. */
export const RUN_HIGHLIGHT_MS = 4000;

interface RoutineNoticesProps {
  routine: Routine | null;
  pending: boolean;
}

/** Status of the routine, shown right above the calendar it describes. */
export function RoutineNotices({ routine, pending }: RoutineNoticesProps) {
  const dispatch = useAppDispatch();
  const suggestion = useReplanSuggestion();
  const dismissedFor = useAppSelector(selectDismissedSuggestionFor);
  const lastRun = useAppSelector(selectLastRun);
  const me = useMe();
  const start = useStartRoutineJob();

  if (pending) {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-card bg-surface px-4 py-3 shadow-card"
      >
        <Spinner className="text-accent-text" />
        <div>
          <p className="text-body font-semibold">Montando sua rotina…</p>
          <p className="text-footnote text-label-secondary">
            A IA propõe os horários e cada bloco é validado contra seus compromissos e prazos.
          </p>
        </div>
      </div>
    );
  }
  if (!routine) return null;

  const showSuggestion = suggestion.data?.needsReplan && dismissedFor !== routine.id;
  const items: NoticeItem[] = [];

  if (showSuggestion && suggestion.data) {
    items.push({
      key: 'suggestion',
      tone: 'info',
      title: 'Sua rotina pode estar desatualizada',
      body: `${capitalize(
        suggestion.data.reasons
          .map((reason) => replanReasonLabel(reason.code, reason.count))
          .join('; '),
      )}. Replanejar mantém blocos travados e concluídos.`,
      actions: (
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch(suggestionDismissed(routine.id))}
          >
            Agora não
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={start.isPending}
            onClick={() => start.mutate({ kind: 'replan' })}
          >
            Replanejar
          </Button>
        </>
      ),
    });
  }

  const isDemo = me.data?.isDemo ?? false;
  if (routine.source === 'HEURISTIC') {
    // In the demo the local planner is the design, not a failure: say so calmly.
    items.push(
      isDemo
        ? {
            key: 'source',
            tone: 'info',
            title: 'Montada pelo planejador local',
            body: 'A conta demo não usa IA: os horários vêm do mesmo planejador que garante a rotina quando a IA falha.',
          }
        : {
            key: 'source',
            tone: 'warning',
            title: 'Rotina gerada sem IA',
            body:
              routine.notice ??
              'A IA não respondeu; os horários foram escolhidos pelo planejador local.',
          },
    );
  } else if (routine.notice) {
    items.push({
      key: 'source',
      tone: 'info',
      title:
        routine.source === 'AI_REPAIRED' ? 'Rotina ajustada automaticamente' : 'Sobre esta rotina',
      body: routine.notice,
    });
  }

  // Tasks scheduled for LESS time than they need come first: the user still has to do them,
  // in a shorter session. Only tasks with no usable time at all are "left out".
  const partial = routine.unscheduled.filter((item) => item.reason === 'PARTIAL');
  const leftOut = routine.unscheduled.filter((item) => item.reason !== 'PARTIAL');

  if (partial.length > 0) {
    items.push({
      key: 'partial',
      tone: 'warning',
      title:
        partial.length === 1
          ? '1 tarefa foi alocada com menos tempo do que precisa'
          : `${partial.length} tarefas foram alocadas com menos tempo do que precisam`,
      body: (
        <ul className="mt-1 flex flex-col gap-1">
          {partial.map((item) => (
            <li key={item.taskId}>
              <span className="font-medium text-label">{item.title}</span>:{' '}
              {describeUnscheduled(item)}
            </li>
          ))}
        </ul>
      ),
      actions: <TasksLink />,
    });
  }

  if (leftOut.length > 0) {
    items.push({
      key: 'unscheduled',
      tone: 'warning',
      title:
        leftOut.length === 1
          ? '1 tarefa ficou fora da rotina'
          : `${leftOut.length} tarefas ficaram fora da rotina`,
      body: (
        <ul className="mt-1 flex flex-col gap-0.5">
          {leftOut.map((item) => (
            <li key={item.taskId}>
              <span className="font-medium text-label">{item.title}</span> —{' '}
              {describeUnscheduled(item)}
            </li>
          ))}
        </ul>
      ),
      actions: <TasksLink />,
    });
  }

  if (lastRun && lastRun.routineId === routine.id) {
    return (
      <RunResultCard
        result={lastRun}
        routine={routine}
        isDemo={isDemo}
        items={items.filter((item) => item.key !== 'source' || item.tone === 'warning')}
      />
    );
  }
  return <StatusStrip items={items} />;
}

/**
 * The answer to "Gerar rotina": what the run did, stated in figures, with the way back.
 * It stays until dismissed or replaced by the next run.
 */
function RunResultCard({
  result,
  routine,
  isDemo,
  items,
}: {
  result: RunResult;
  routine: Routine;
  isDemo: boolean;
  items: readonly NoticeItem[];
}) {
  const dispatch = useAppDispatch();
  const highlight = useAppSelector(selectRunHighlight);
  const restore = useRestoreRoutine();
  const toast = useToast();

  useEffect(() => {
    if (!highlight) return undefined;
    const id = setTimeout(() => dispatch(runHighlightSet(false)), RUN_HIGHLIGHT_MS);
    return () => clearTimeout(id);
  }, [highlight, dispatch]);

  const changed = result.added + result.moved;
  const partial = routine.unscheduled.filter((item) => item.reason === 'PARTIAL').length;
  const leftOut = routine.unscheduled.length - partial;
  const attention = partial + leftOut > 0 || (routine.source === 'HEURISTIC' && !isDemo);
  const title =
    result.previousRoutineId && changed === 0
      ? 'Semana em dia: nada mudou'
      : routine.trigger === 'REPLAN'
        ? 'Semana replanejada'
        : 'Semana montada';
  const source =
    routine.source === 'HEURISTIC'
      ? isDemo
        ? 'pelo planejador local'
        : 'sem IA'
      : routine.source === 'AI_REPAIRED'
        ? 'pela IA, com ajustes'
        : 'pela IA';

  const replay = () => {
    dispatch(runHighlightSet(false));
    requestAnimationFrame(() => dispatch(runHighlightSet(true)));
  };
  const undo = () => {
    if (!result.previousRoutineId) return;
    restore.mutate(result.previousRoutineId, {
      onSuccess: () => {
        dispatch(runDismissed());
        toast.success('Versão anterior restaurada');
      },
      onError: () => toast.error('Não foi possível desfazer. Tente pelo Histórico.'),
    });
  };

  return (
    <section
      aria-label="Resultado da rotina"
      style={toneStyle(attention ? 'orange' : 'green')}
      className="rounded-card bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--tone)/15 text-(--tone)"
        >
          <Icon name={attention ? 'alert' : 'check'} size={18} strokeWidth={2.5} />
        </span>
        <div role="status" className="min-w-0 flex-1 basis-64">
          <p className="text-headline font-semibold">{title}</p>
          <p className="text-footnote text-label-secondary">
            <span className="font-semibold text-label tabular-nums">
              {describeRun(result)
                .split(' · ')
                .map((part, index) => (
                  <Fragment key={part}>
                    {index > 0 ? <Dot /> : null}
                    {part}
                  </Fragment>
                ))}
            </span>
            {partial > 0 ? (
              <span className="font-semibold text-warning">
                <Dot />
                {partial} com menos tempo
              </span>
            ) : null}
            {leftOut > 0 ? (
              <span className="font-semibold text-warning">
                <Dot />
                {leftOut} {leftOut === 1 ? 'ficou' : 'ficaram'} fora
              </span>
            ) : null}
            <span>
              <Dot />
              {source}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {changed > 0 ? (
            <Button size="sm" variant="ghost" icon="refresh" onClick={replay}>
              Ver o que mudou
            </Button>
          ) : null}
          {result.previousRoutineId && changed > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              icon="restore"
              loading={restore.isPending}
              onClick={undo}
            >
              Desfazer
            </Button>
          ) : null}
          <IconButton
            icon="close"
            label="Dispensar resultado"
            onClick={() => dispatch(runDismissed())}
          />
        </div>
      </div>
      {items.length > 0 ? <NoticeDetails items={items} /> : null}
    </section>
  );
}

/** The notices of a run, folded under the result card. */
function NoticeDetails({ items }: { items: readonly NoticeItem[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-t border-hairline">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="pressable flex min-h-11 w-full items-center gap-2 px-4 text-left text-footnote font-semibold text-label-secondary"
      >
        {open ? 'Ocultar detalhes' : `Ver detalhes (${items.length})`}
        <Icon name="chevron-down" size={16} className={cn('shrink-0', open && 'rotate-180')} />
      </button>
      {open ? <NoticeList id={id} items={items} /> : null}
    </div>
  );
}

function NoticeList({ id, items }: { id: string; items: readonly NoticeItem[] }) {
  return (
    <ul id={id} className="flex flex-col divide-y divide-hairline border-t border-hairline">
      {items.map((item) => (
        <li key={item.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1 basis-56">
            <p className="text-body font-semibold">{item.title}</p>
            <div className="text-footnote text-label-secondary">{item.body}</div>
          </div>
          {item.actions ? (
            <div className="flex shrink-0 items-center gap-2">{item.actions}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TasksLink() {
  return (
    <Link
      href="/tarefas"
      className="pressable inline-flex h-11 items-center rounded-control bg-fill px-3.5 text-footnote font-medium text-label"
    >
      Ver tarefas
    </Link>
  );
}

interface NoticeItem {
  key: string;
  tone: 'info' | 'warning';
  title: string;
  body: ReactNode;
  actions?: ReactNode;
}

/**
 * Every notice about the routine in ONE collapsible strip: a counter while closed, the details
 * (and their actions) when opened. Progressive disclosure: the calendar stays calm.
 */
function StatusStrip({ items }: { items: readonly NoticeItem[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (items.length === 0) return null;
  const warning = items.some((item) => item.tone === 'warning');
  const summary = items.length === 1 ? (items[0] as NoticeItem).title : `${items.length} avisos`;

  return (
    <section
      aria-label="Avisos da rotina"
      style={toneStyle(warning ? 'orange' : 'blue')}
      className="rounded-card bg-surface shadow-[0_0_0_1px_var(--hairline)]"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="pressable flex min-h-11 w-full items-center gap-3 rounded-card px-4 py-2 text-left"
      >
        <Icon name={warning ? 'alert' : 'info'} className="tone-text shrink-0" size={18} />
        <span className="min-w-0 flex-1 text-body font-medium">{summary}</span>
        <span className="text-footnote text-label-secondary">
          {open ? 'Ocultar' : 'Ver detalhes'}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className={cn('shrink-0 text-label-tertiary', open && 'rotate-180')}
        />
      </button>
      {open ? <NoticeList id={id} items={items} /> : null}
    </section>
  );
}

/**
 * The separator between figures. A font's middle dot can sit off-centre in its advance, so it is
 * centred in a box of its own; the spaces keep the text readable when copied or read aloud.
 */
function Dot() {
  return (
    <>
      {' '}
      <span className="inline-block w-1.5 text-center">·</span>{' '}
    </>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
