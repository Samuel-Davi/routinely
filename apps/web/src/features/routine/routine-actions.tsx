'use client';

import {
  QUICK_INSTRUCTION_MAX_CHARS,
  QUICK_INSTRUCTION_MAX_WORDS,
  countWords,
  quickInstructionSchema,
} from '@routinely/shared';
import { useState } from 'react';
import { Banner, Button, Sheet, Textarea } from '@/components/ui';
import { formatWeekRange } from '@/features/calendar/layout';
import { AiPrivacyNotice } from '@/features/auth/ai-privacy-notice';
import { useMe } from '@/features/auth/api';
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
        <Button
          icon="refresh"
          loading={busy}
          onClick={() => dispatch(panelOpened({ type: 'generate-routine', mode: 'replan' }))}
        >
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
      <GenerateRoutineSheet
        onGenerate={(input) => start.mutate({ kind: 'generate', input })}
        onReplan={(instruction) => start.mutate({ kind: 'replan', instruction })}
      />
    </>
  );
}

function GenerateRoutineSheet({
  onGenerate,
  onReplan,
}: {
  onGenerate: (input: {
    weekStart?: string;
    untilLastDeadline: boolean;
    instruction?: string;
  }) => void;
  onReplan: (instruction?: string) => void;
}) {
  const dispatch = useAppDispatch();
  const panel = useAppSelector(selectPanel);
  const open = panel?.type === 'generate-routine';
  const replanning = open && panel.mode === 'replan';
  const weekStart = useAppSelector(selectWeekStart);
  const weekDates = useAppSelector(selectWeekDates);
  const ai = useAiStatus();
  const me = useMe();
  const [untilLastDeadline, setUntilLastDeadline] = useState(false);
  const [instruction, setInstruction] = useState('');
  const close = () => dispatch(panelClosed());

  const parsed = quickInstructionSchema.safeParse(instruction);
  const words = countWords(instruction);
  const error = parsed.success ? undefined : parsed.error.issues[0]?.message;

  const submit = () => {
    if (!parsed.success) return;
    const text = parsed.data === '' ? undefined : parsed.data;
    if (replanning) onReplan(text);
    else onGenerate({ weekStart: weekStart ?? undefined, untilLastDeadline, instruction: text });
    setInstruction('');
    close();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={replanning ? 'Replanejar' : 'Gerar rotina'}
      description={
        replanning ? 'Refaz só o futuro da rotina' : `Semana de ${formatWeekRange(weekDates)}`
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={replanning ? 'refresh' : 'sparkles'}
            data-autofocus
            disabled={!parsed.success}
            onClick={submit}
          >
            {replanning ? 'Replanejar' : 'Gerar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body text-label-secondary">
          {replanning
            ? 'Blocos de hoje em diante são refeitos. Blocos travados e concluídos são mantidos.'
            : 'As tarefas abertas são distribuídas nos horários livres entre seus compromissos, respeitando prazos e preferências. Blocos travados e concluídos são mantidos.'}
        </p>
        {replanning ? null : (
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
        )}
        <Textarea
          label="Instrução rápida (opcional)"
          placeholder="Ex.: priorize Web Academy · sem trabalho no domingo · manhãs livres na sexta"
          rows={2}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          error={error}
          hint={`${words}/${QUICK_INSTRUCTION_MAX_WORDS} palavras · ${instruction.trim().length}/${QUICK_INSTRUCTION_MAX_CHARS} caracteres. É só uma preferência: as regras e os prazos continuam valendo.`}
        />
        {me.data?.isDemo ? (
          <Banner tone="info" title="Modo demo, sem IA">
            A conta demo usa só o planejador determinístico: nada é enviado a nenhuma IA.
          </Banner>
        ) : ai.data?.configured ? (
          // Text typed here (the quick instruction) and the task data go to the AI.
          <AiPrivacyNotice />
        ) : null}
        {!me.data?.isDemo && ai.data && !ai.data.configured ? (
          <Banner tone="warning" title="IA não configurada">
            Sem uma chave de API, a rotina é montada por um algoritmo determinístico, sem a IA, e a
            instrução rápida é ignorada.
          </Banner>
        ) : null}
      </div>
    </Sheet>
  );
}
