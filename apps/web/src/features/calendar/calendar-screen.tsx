'use client';

import type { ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '@/components/ui';
import { useCommitments } from '@/features/commitments/api';
import { usePreferences } from '@/features/preferences/api';
import { useActiveRoutine } from '@/features/routine/api';
import { errorMessage } from '@/lib/api-client';
import { env } from '@/lib/env';
import { selectSelectedDate, selectWeekDates } from '@/lib/store/calendar-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { panelOpened } from '@/lib/store/ui-slice';
import { CalendarFiltersSheet } from './calendar-filters';
import { CalendarHeader } from './calendar-header';
import type { PositionedBlock } from './layout';
import { TaskBlockView, blockAccessibleName } from './task-block';
import { useNow, useResponsiveViewMode, useToday } from './use-calendar-clock';
import { WeekCalendar } from './week-calendar';

export interface CalendarSlots {
  /** The primary action shown next to the title (generate). */
  actions?: ReactNode;
  /** Secondary actions, inside the "more options" menu. */
  menuItems?: (close: () => void) => ReactNode;
  /** Banners between the header and the grid (AI notice, replan suggestion…). */
  notices?: ReactNode;
  /** Shown instead of the default hint when there is no routine yet. */
  emptyRoutine?: ReactNode;
  /** Replaces the default (read-only) block, e.g. with a draggable one. */
  renderBlock?: (positioned: PositionedBlock, timezone: string) => ReactNode;
  /** Wraps the grid (e.g. with a drag & drop context). */
  wrapGrid?: (grid: ReactNode) => ReactNode;
  renderOverlay?: (date: string) => ReactNode;
}

function CalendarSkeleton() {
  return (
    <LoadingRegion label="Carregando calendário">
      <Skeleton className="mb-4 h-9 w-64" />
      <Skeleton className="mb-4 h-11 w-full max-w-md" />
      <Skeleton className="h-[32rem] rounded-card" />
    </LoadingRegion>
  );
}

/** Weekly calendar screen: fixed commitments plus the active routine's blocks. */
export function CalendarScreen({
  actions,
  menuItems,
  notices,
  emptyRoutine,
  renderBlock,
  wrapGrid,
  renderOverlay,
}: CalendarSlots) {
  const dispatch = useAppDispatch();
  const preferences = usePreferences();
  const commitments = useCommitments();
  const routine = useActiveRoutine();
  const timezone = preferences.data?.timezone ?? env.defaultTimezone;
  const today = useToday(timezone);
  const now = useNow();
  useResponsiveViewMode();
  const selectedDate = useAppSelector(selectSelectedDate);
  const weekDates = useAppSelector(selectWeekDates);

  const failed = [preferences, commitments, routine].find((query) => query.isError);
  if (failed) {
    return (
      <ErrorState
        message={errorMessage(failed.error)}
        onRetry={() => {
          void preferences.refetch();
          void commitments.refetch();
          void routine.refetch();
        }}
      />
    );
  }
  if (
    !preferences.data ||
    !commitments.data ||
    routine.data === undefined ||
    !today ||
    !selectedDate
  ) {
    return <CalendarSkeleton />;
  }

  const prefs = preferences.data;
  const defaultBlock = (positioned: PositionedBlock) => (
    <button
      type="button"
      data-no-swipe
      aria-label={blockAccessibleName(positioned.block, prefs.timezone)}
      onClick={() => dispatch(panelOpened({ type: 'block-details', blockId: positioned.block.id }))}
      className="pressable block h-full w-full"
    >
      <TaskBlockView
        block={positioned.block}
        timezone={prefs.timezone}
        height={positioned.height}
      />
    </button>
  );

  const grid = (
    <WeekCalendar
      prefs={prefs}
      commitments={commitments.data}
      blocks={routine.data?.blocks ?? []}
      today={today}
      now={now}
      renderBlock={
        renderBlock ? (positioned) => renderBlock(positioned, prefs.timezone) : defaultBlock
      }
      renderOverlay={renderOverlay}
    />
  );

  return (
    <>
      <CalendarHeader
        weekDates={weekDates}
        selectedDate={selectedDate}
        today={today}
        actions={actions}
        menuItems={menuItems}
      />
      {notices ? <div className="mb-4 flex flex-col gap-2">{notices}</div> : null}
      {routine.data === null
        ? (emptyRoutine ?? (
            <EmptyState
              icon="sparkles"
              compact
              title="Você ainda não tem uma rotina"
              description="Cadastre compromissos e tarefas e gere a rotina da semana."
              className="mb-4 rounded-card bg-surface shadow-card"
            />
          ))
        : null}
      {wrapGrid ? wrapGrid(grid) : grid}
      <CalendarFiltersSheet />
    </>
  );
}
