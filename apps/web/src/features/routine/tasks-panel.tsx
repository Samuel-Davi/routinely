'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { IconButton } from '@/components/ui';
import { LineBadge, lineStyle, useLine, useLineOrder } from '@/features/calendar/lines';
import { usePreferences } from '@/features/preferences/api';
import { useTasks } from '@/features/tasks/api';
import { cn } from '@/lib/cn';
import { env } from '@/lib/env';
import { formatDuration, formatRelativeDeadline } from '@/lib/labels';
import { selectWeekDates } from '@/lib/store/calendar-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { selectFocusedTaskId, taskFocused, tasksPanelToggled } from '@/lib/store/ui-slice';
import { useActiveRoutine } from './api';
import { buildStations, type Station, type StationGroup } from './stations';

/**
 * The week's open tasks beside the grid, grouped by the line they ride: what still has to be
 * done, how much of it this week holds, and what did not fit. Picking a task marks its blocks
 * on the grid; nothing here changes the routine.
 */
export function TasksPanel() {
  const dispatch = useAppDispatch();
  const tasks = useTasks();
  const routine = useActiveRoutine();
  const preferences = usePreferences();
  const weekDates = useAppSelector(selectWeekDates);
  const lineOrder = useLineOrder();
  const timezone = preferences.data?.timezone ?? env.defaultTimezone;

  const groups = useMemo(
    () => buildStations(tasks.data ?? [], routine.data ?? null, weekDates, timezone, lineOrder),
    [tasks.data, routine.data, weekDates, timezone, lineOrder],
  );
  const open = groups.reduce((sum, group) => sum + group.stations.length, 0);

  return (
    <aside
      aria-label="Tarefas abertas"
      className="flex min-h-0 w-full flex-col rounded-card bg-fill/60"
    >
      <div className="flex items-center gap-2 py-1 pr-1 pl-3">
        <h2 className="flex-1 text-headline font-semibold">
          Tarefas abertas{' '}
          <span className="font-semibold text-label-secondary tabular-nums">{open}</span>
        </h2>
        <IconButton
          icon="close"
          label="Ocultar painel de tarefas"
          onClick={() => dispatch(tasksPanelToggled())}
        />
      </div>
      {tasks.data && open === 0 ? (
        <p className="px-4 py-6 text-footnote text-label-secondary">
          Nenhuma tarefa aberta.{' '}
          <Link
            href="/tarefas"
            className="font-semibold text-accent-text underline-offset-2 hover:underline"
          >
            Criar uma tarefa
          </Link>
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
          {groups.map((group) => (
            <LineGroup key={group.commitmentId ?? 'free'} group={group} />
          ))}
        </div>
      )}
    </aside>
  );
}

function LineGroup({ group }: { group: StationGroup }) {
  const line = useLine(group.commitmentId);
  return (
    <section aria-label={line.title}>
      <h3 className="flex items-center gap-2 px-1.5 pb-1.5 text-footnote font-semibold text-label-secondary">
        <LineBadge line={line} />
        <span className="min-w-0 flex-1 truncate">{line.title}</span>
        <span className="tabular-nums">{group.stations.length}</span>
      </h3>
      <ul style={lineStyle(line)} className="flex flex-col gap-1.5">
        {group.stations.map((station) => (
          <StationRow key={station.task.id} station={station} />
        ))}
      </ul>
    </section>
  );
}

/** One open task as a card: check circle, title, deadline and this week's time. */
function StationRow({ station }: { station: Station }) {
  const dispatch = useAppDispatch();
  const focused = useAppSelector(selectFocusedTaskId) === station.task.id;
  const { task, weekMinutes, flag } = station;
  const deadline = formatRelativeDeadline(task.deadline);
  const estimate = task.estimatedMinutes;

  const focus = () => {
    dispatch(taskFocused(task.id));
    if (focused) return;
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-task-id="${task.id}"]`)
        ?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }),
    );
  };

  return (
    <li>
      <button
        type="button"
        aria-pressed={focused}
        onClick={focus}
        className={cn(
          'pressable flex w-full items-start gap-2.5 rounded-[0.5rem] bg-surface p-2.5 text-left shadow-card transition-shadow hover:shadow-raised',
          focused && 'station-focused',
        )}
      >
        <span
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 rounded-full border-[1.5px] border-label-tertiary"
        />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-footnote font-medium text-label">{task.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-label-secondary tabular-nums">
            <span className={cn(deadline.overdue && 'font-semibold text-danger')}>
              {deadline.text}
            </span>
            <span className="rounded-[0.25rem] bg-fill px-1.5 py-px">
              {weekLabel(weekMinutes, estimate)}
            </span>
          </span>
          {flag ? (
            <span className="mt-1 block text-caption font-semibold text-warning">
              {flag === 'PARTIAL' ? 'Com menos tempo do que precisa' : 'Ficou fora da rotina'}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/** "Tudo agendado", "1h de 3h agendadas" or "Nada agendado": this week's time in words. */
function weekLabel(minutes: number, estimate: number | null): string {
  if (minutes === 0) return 'Nada agendado';
  if (estimate !== null && minutes >= estimate) return 'Tudo agendado';
  return estimate === null
    ? `${formatDuration(minutes)} agendada`
    : `${formatDuration(minutes)} de ${formatDuration(estimate)} agendadas`;
}
