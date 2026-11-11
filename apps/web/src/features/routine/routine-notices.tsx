'use client';

import type { Routine } from '@routinely/shared';
import Link from 'next/link';
import { Banner, Button, Spinner } from '@/components/ui';
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

  return (
    <>
      {showSuggestion && suggestion.data ? (
        <Banner
          title="Sua rotina pode estar desatualizada"
          icon="refresh"
          actions={
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
          }
        >
          {capitalize(
            suggestion.data.reasons
              .map((reason) => replanReasonLabel(reason.code, reason.count))
              .join('; '),
          )}
          . Replanejar mantém blocos travados e concluídos.
        </Banner>
      ) : null}

      {routine.source === 'HEURISTIC' ? (
        <Banner tone="warning" title="Rotina gerada sem IA">
          {routine.notice ?? 'Os horários foram escolhidos por um algoritmo determinístico.'}
        </Banner>
      ) : routine.notice ? (
        <Banner
          title={
            routine.source === 'AI_REPAIRED'
              ? 'Rotina ajustada automaticamente'
              : 'Sobre esta rotina'
          }
        >
          {routine.notice}
        </Banner>
      ) : null}

      {routine.unscheduled.length > 0 ? (
        <Banner
          tone="warning"
          title={
            routine.unscheduled.length === 1
              ? '1 tarefa ficou fora da rotina'
              : `${routine.unscheduled.length} tarefas ficaram fora da rotina`
          }
          actions={
            <Link
              href="/tarefas"
              className="pressable rounded-control bg-fill px-3 py-1.5 text-footnote font-medium text-label"
            >
              Ver tarefas
            </Link>
          }
        >
          <ul className="mt-1 flex flex-col gap-0.5">
            {routine.unscheduled.map((item) => (
              <li key={item.taskId}>
                <span className="font-medium text-label">{item.title}</span> —{' '}
                {UNSCHEDULED_REASON_LABEL[item.reason]}
              </li>
            ))}
          </ul>
        </Banner>
      ) : null}
    </>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
