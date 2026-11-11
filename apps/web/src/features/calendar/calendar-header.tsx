'use client';

import type { DateString } from '@routinely/shared';
import type { ReactNode } from 'react';
import { Button, IconButton, Menu, MenuItem, MenuSeparator } from '@/components/ui';
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
  /** The one primary action (generate), provided by the routine feature. */
  actions?: ReactNode;
  /** Secondary actions (replan…) for the "more options" menu. */
  menuItems?: (close: () => void) => ReactNode;
}

export function CalendarHeader({
  weekDates,
  selectedDate,
  today,
  actions,
  menuItems,
}: CalendarHeaderProps) {
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
      {/* One bar: where I am, how to move, the one thing to do, and everything else in a menu. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="mr-auto text-title font-bold sm:text-display" aria-live="polite">
          {dayMode
            ? formatDate(selectedDate, { day: 'numeric', month: 'long' })
            : formatWeekRange(weekDates)}
        </h1>

        <div className="flex items-center rounded-full bg-fill">
          <IconButton
            icon="chevron-left"
            label={dayMode ? 'Dia anterior' : 'Semana anterior'}
            onClick={() => shift(-1)}
          />
          <Button
            size="sm"
            variant="ghost"
            className="px-2 text-label"
            onClick={() => dispatch(dateSelected(today))}
          >
            Hoje
          </Button>
          <IconButton
            icon="chevron-right"
            label={dayMode ? 'Próximo dia' : 'Próxima semana'}
            onClick={() => shift(1)}
          />
        </div>

        {actions}

        <Menu label="Mais opções" indicator={filterCount > 0}>
          {(close) => (
            <>
              {/* On phones the calendar is always a day view; the switch is a desktop choice. */}
              <div className="hidden md:block" role="group" aria-label="Modo de visão">
                <MenuItem
                  icon="calendar"
                  checked={viewMode === 'week'}
                  onSelect={() => {
                    dispatch(viewModeChosen('week'));
                    close();
                  }}
                >
                  Visão semanal
                </MenuItem>
                <MenuItem
                  icon="clock"
                  checked={viewMode === 'day'}
                  onSelect={() => {
                    dispatch(viewModeChosen('day'));
                    close();
                  }}
                >
                  Visão diária
                </MenuItem>
                <MenuSeparator />
              </div>
              <MenuItem
                icon="filter"
                detail={filterCount > 0 ? String(filterCount) : undefined}
                onSelect={() => {
                  dispatch(panelOpened({ type: 'calendar-filters' }));
                  close();
                }}
              >
                Filtros
              </MenuItem>
              {menuItems?.(close)}
            </>
          )}
        </Menu>
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
                <span className="text-caption font-medium">{WEEKDAY_SHORT[dow]}</span>
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
