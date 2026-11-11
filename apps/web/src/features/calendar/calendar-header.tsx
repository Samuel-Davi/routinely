'use client';

import type { DateString } from '@routinely/shared';
import type { ReactNode } from 'react';
import { Button, IconButton, SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/cn';
import { WEEKDAY_SHORT, formatDate } from '@/lib/labels';
import {
  dateSelected,
  dayShifted,
  selectActiveFilterCount,
  selectViewMode,
  viewModeChosen,
  weekShifted,
} from '@/lib/store/calendar-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { panelOpened } from '@/lib/store/ui-slice';
import { dayLabel } from './day-column';
import { formatWeekRange } from './layout';

interface CalendarHeaderProps {
  weekDates: readonly DateString[];
  selectedDate: DateString;
  today: DateString;
  /** Routine actions (generate / replan), provided by the routine feature. */
  actions?: ReactNode;
}

export function CalendarHeader({ weekDates, selectedDate, today, actions }: CalendarHeaderProps) {
  const dispatch = useAppDispatch();
  const viewMode = useAppSelector(selectViewMode);
  const filterCount = useAppSelector(selectActiveFilterCount);
  const dayMode = viewMode === 'day';

  const shift = (direction: 1 | -1) =>
    dispatch(
      dayMode ? dayShifted({ days: direction, today }) : weekShifted({ weeks: direction, today }),
    );

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-auto text-title font-bold sm:text-display" aria-live="polite">
          {dayMode
            ? formatDate(selectedDate, { day: 'numeric', month: 'long' })
            : formatWeekRange(weekDates)}
        </h1>
        {actions}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-control bg-fill">
          <IconButton
            icon="chevron-left"
            size="sm"
            label={dayMode ? 'Dia anterior' : 'Semana anterior'}
            onClick={() => shift(-1)}
          />
          <Button
            size="sm"
            variant="ghost"
            className="text-label"
            onClick={() => dispatch(dateSelected(today))}
          >
            Hoje
          </Button>
          <IconButton
            icon="chevron-right"
            size="sm"
            label={dayMode ? 'Próximo dia' : 'Próxima semana'}
            onClick={() => shift(1)}
          />
        </div>

        {/* On phones the calendar is always a day view; the switch is a desktop choice. */}
        <div className="hidden md:block">
          <SegmentedControl
            label="Modo de visão"
            value={viewMode}
            onChange={(mode) => dispatch(viewModeChosen(mode))}
            options={[
              { value: 'week', label: 'Semana' },
              { value: 'day', label: 'Dia' },
            ]}
          />
        </div>

        <Button
          size="sm"
          icon="filter"
          className="ml-auto"
          onClick={() => dispatch(panelOpened({ type: 'calendar-filters' }))}
        >
          Filtros{filterCount > 0 ? ` (${filterCount})` : ''}
        </Button>
      </div>

      {dayMode ? (
        <div role="tablist" aria-label="Dias da semana" className="grid grid-cols-7 gap-1">
          {weekDates.map((date) => {
            const selected = date === selectedDate;
            const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
            return (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={dayLabel(date)}
                tabIndex={selected ? 0 : -1}
                onClick={() => dispatch(dateSelected(date))}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                  event.preventDefault();
                  dispatch(dayShifted({ days: event.key === 'ArrowRight' ? 1 : -1, today }));
                  const list = event.currentTarget.parentElement;
                  requestAnimationFrame(() =>
                    list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(),
                  );
                }}
                className={cn(
                  'pressable flex flex-col items-center gap-0.5 rounded-control py-1.5',
                  selected ? 'bg-accent text-on-accent' : 'text-label-secondary hover:bg-fill',
                )}
              >
                <span className="text-[0.6875rem] font-medium">{WEEKDAY_SHORT[dow]}</span>
                <span
                  className={cn(
                    'text-headline font-semibold tabular-nums',
                    !selected && date === today && 'text-accent-text',
                  )}
                >
                  {Number(date.slice(8))}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
