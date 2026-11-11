'use client';

import type { Routine } from '@routinely/shared';
import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { Button, Icon, Spinner, toneStyle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { UNSCHEDULED_REASON_LABEL, replanReasonLabel } from '@/lib/labels';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { selectDismissedSuggestionFor, suggestionDismissed } from '@/lib/store/ui-slice';
import { useReplanSuggestion, useStartRoutineJob } from './api';

interface RoutineNoticesProps {
  routine: Routine | null;
  pending: boolean;
}

/** Status of the routine, shown right above the calendar it describes. */
export function RoutineNotices({ routine, pending }: RoutineNoticesProps) {
  const dispatch = useAppDispatch();
  const suggestion = useReplanSuggestion();
  const dismissedFor = useAppSelector(selectDismissedSuggestionFor);
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

  if (routine.source === 'HEURISTIC') {
    items.push({
      key: 'source',
      tone: 'warning',
      title: 'Rotina gerada sem IA',
      body: routine.notice ?? 'Os horários foram escolhidos por um algoritmo determinístico.',
    });
  } else if (routine.notice) {
    items.push({
      key: 'source',
      tone: 'info',
      title:
        routine.source === 'AI_REPAIRED' ? 'Rotina ajustada automaticamente' : 'Sobre esta rotina',
      body: routine.notice,
    });
  }

  if (routine.unscheduled.length > 0) {
    items.push({
      key: 'unscheduled',
      tone: 'warning',
      title:
        routine.unscheduled.length === 1
          ? '1 tarefa ficou fora da rotina'
          : `${routine.unscheduled.length} tarefas ficaram fora da rotina`,
      body: (
        <ul className="mt-1 flex flex-col gap-0.5">
          {routine.unscheduled.map((item) => (
            <li key={item.taskId}>
              <span className="font-medium text-label">{item.title}</span> —{' '}
              {UNSCHEDULED_REASON_LABEL[item.reason]}
            </li>
          ))}
        </ul>
      ),
      actions: (
        <Link
          href="/tarefas"
          className="pressable inline-flex h-11 items-center rounded-control bg-fill px-3.5 text-footnote font-medium text-label"
        >
          Ver tarefas
        </Link>
      ),
    });
  }

  return <StatusStrip items={items} />;
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
        <span className="min-w-0 flex-1 truncate text-body font-medium">{summary}</span>
        <span className="text-footnote text-label-secondary">
          {open ? 'Ocultar' : 'Ver detalhes'}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className={cn('shrink-0 text-label-tertiary', open && 'rotate-180')}
        />
      </button>
      {open ? (
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
      ) : null}
    </section>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
