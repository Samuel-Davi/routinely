'use client';

import Link from 'next/link';
import { Button, EmptyState } from '@/components/ui';
import { CalendarScreen } from '@/features/calendar/calendar-screen';
import { useCommitments } from '@/features/commitments/api';
import { usePreferences } from '@/features/preferences/api';
import { useTasks } from '@/features/tasks/api';
import { useAppDispatch } from '@/lib/store/hooks';
import { panelOpened } from '@/lib/store/ui-slice';
import { useActiveRoutine, useRoutineJob } from './api';
import { BlockDetailsSheet } from './block-details-sheet';
import { DraggableBlock } from './draggable-block';
import { RoutineActions } from './routine-actions';
import { DayDropZone, RoutineDndProvider } from './routine-dnd';
import { RoutineNotices } from './routine-notices';

/** The week: calendar + everything you can do with the routine on it. */
export function WeekScreen() {
  const dispatch = useAppDispatch();
  const preferences = usePreferences();
  const commitments = useCommitments();
  const routine = useActiveRoutine();
  const tasks = useTasks();
  const { pending } = useRoutineJob();

  const blocks = routine.data?.blocks ?? [];
  const hasOpenTasks = tasks.data?.some((task) => task.status !== 'DONE') ?? false;
  const ready = preferences.data !== undefined && commitments.data !== undefined;

  return (
    <CalendarScreen
      actions={<RoutineActions hasRoutine={Boolean(routine.data)} pending={pending} />}
      notices={
        pending || routine.data ? (
          <RoutineNotices routine={routine.data ?? null} pending={pending} />
        ) : undefined
      }
      emptyRoutine={
        pending ? (
          <></>
        ) : (
          <EmptyState
            icon="sparkles"
            compact
            title={hasOpenTasks ? 'Pronto para montar sua semana' : 'Comece pelas suas tarefas'}
            description={
              hasOpenTasks
                ? 'Gere a rotina e a IA distribui suas tarefas nos horários livres, respeitando compromissos e prazos.'
                : 'Crie tarefas com prazo e prioridade. Depois, gere a rotina da semana.'
            }
            className="mb-4 rounded-card bg-surface shadow-card"
            action={
              hasOpenTasks ? (
                <Button
                  variant="primary"
                  icon="sparkles"
                  onClick={() => dispatch(panelOpened({ type: 'generate-routine' }))}
                >
                  Gerar rotina
                </Button>
              ) : (
                <Link
                  href="/tarefas"
                  className="pressable rounded-control bg-accent px-4 py-2 font-medium text-on-accent"
                >
                  Ir para tarefas
                </Link>
              )
            }
          />
        )
      }
      renderBlock={(positioned, timezone) => (
        <DraggableBlock positioned={positioned} timezone={timezone} />
      )}
      renderOverlay={(date) => <DayDropZone date={date} />}
      wrapGrid={(grid) =>
        ready ? (
          <RoutineDndProvider
            prefs={preferences.data}
            commitments={commitments.data}
            blocks={blocks}
            locked={pending}
          >
            {grid}
            <BlockDetailsSheet blocks={blocks} />
          </RoutineDndProvider>
        ) : (
          grid
        )
      }
    />
  );
}
