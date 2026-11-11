'use client';

import { useState } from 'react';
import { Banner, Button, Sheet } from '@/components/ui';
import { formatWeekRange } from '@/features/calendar/layout';
import { selectWeekDates, selectWeekStart } from '@/lib/store/calendar-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { panelClosed, panelOpened, selectPanel } from '@/lib/store/ui-slice';
import { useAiStatus, useStartRoutineJob } from './api';

interface RoutineActionsProps {
  hasRoutine: boolean;
  pending: boolean;
}

/** "Gerar rotina" and "Replanejar", next to the calendar title. */
export function RoutineActions({ hasRoutine, pending }: RoutineActionsProps) {
  const dispatch = useAppDispatch();
  const start = useStartRoutineJob();
  const busy = pending || start.isPending;

  return (
    <>
      {hasRoutine ? (
        <Button icon="refresh" loading={busy} onClick={() => start.mutate({ kind: 'replan' })}>
          {busy ? 'Replanejando…' : 'Replanejar'}
        </Button>
      ) : null}
      <Button
        variant={hasRoutine ? 'secondary' : 'primary'}
        icon="sparkles"
        loading={!hasRoutine && busy}
        disabled={busy}
        onClick={() => dispatch(panelOpened({ type: 'generate-routine' }))}
      >
        {!hasRoutine && busy ? 'Gerando…' : 'Gerar rotina'}
      </Button>
      <GenerateRoutineSheet onGenerate={(input) => start.mutate({ kind: 'generate', input })} />
    </>
  );
}

function GenerateRoutineSheet({
  onGenerate,
}: {
  onGenerate: (input: { weekStart?: string; untilLastDeadline: boolean }) => void;
}) {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectPanel)?.type === 'generate-routine';
  const weekStart = useAppSelector(selectWeekStart);
  const weekDates = useAppSelector(selectWeekDates);
  const ai = useAiStatus();
  const [untilLastDeadline, setUntilLastDeadline] = useState(false);
  const close = () => dispatch(panelClosed());

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Gerar rotina"
      description={`Semana de ${formatWeekRange(weekDates)}`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon="sparkles"
            data-autofocus
            onClick={() => {
              onGenerate({ weekStart: weekStart ?? undefined, untilLastDeadline });
              close();
            }}
          >
            Gerar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-label-secondary">
          As tarefas abertas são distribuídas nos horários livres entre seus compromissos,
          respeitando prazos e preferências. Blocos travados e concluídos são mantidos.
        </p>
        <label className="flex items-start gap-3 rounded-card bg-fill p-4 text-body">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-(--accent)"
            checked={untilLastDeadline}
            onChange={(event) => setUntilLastDeadline(event.target.checked)}
          />
          <span>
            <span className="font-medium">Planejar até o último prazo</span>
            <span className="block text-footnote text-label-secondary">
              Estende a rotina além desta semana, por no máximo 4 semanas.
            </span>
          </span>
        </label>
        {ai.data && !ai.data.configured ? (
          <Banner tone="warning" title="IA não configurada">
            Sem uma chave de API, a rotina é montada por um algoritmo determinístico, sem IA.
          </Banner>
        ) : null}
      </div>
    </Sheet>
  );
}
