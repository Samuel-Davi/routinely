'use client';

import type { DateString, FixedCommitment, Preferences, RoutineBlock } from '@routinely/shared';
import { motion, useDragControls, useReducedMotion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { WEEKDAY_SHORT } from '@/lib/labels';
import {
  dayShifted,
  selectCalendarFilters,
  selectViewMode,
  selectVisibleDates,
} from '@/lib/store/calendar-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { DayColumn, dayLabel } from './day-column';
import {
  HOUR_HEIGHT,
  filterBlocks,
  gridBounds,
  gridHeight,
  hourLabels,
  projectMomentum,
  type PositionedBlock,
} from './layout';

interface WeekCalendarProps {
  prefs: Preferences;
  commitments: readonly FixedCommitment[];
  blocks: readonly RoutineBlock[];
  today: DateString;
  now: number | null;
  renderBlock: (positioned: PositionedBlock) => ReactNode;
  /** Per-day layer above the blocks (drag preview). */
  renderOverlay?: (date: DateString) => ReactNode;
}

/** Distance a swipe must (be projected to) travel to turn the page. */
const SWIPE_THRESHOLD = 90;

/**
 * The time grid: seven columns on wide screens, a single swipeable day on phones.
 * Fixed commitments and task blocks share the same vertical time scale.
 */
export function WeekCalendar({
  prefs,
  commitments,
  blocks,
  today,
  now,
  renderBlock,
  renderOverlay,
}: WeekCalendarProps) {
  const dispatch = useAppDispatch();
  const dates = useAppSelector(selectVisibleDates);
  const viewMode = useAppSelector(selectViewMode);
  const filters = useAppSelector(selectCalendarFilters);
  const reducedMotion = useReducedMotion();
  const dragControls = useDragControls();

  const bounds = useMemo(() => gridBounds(prefs), [prefs]);
  const visibleBlocks = useMemo(() => filterBlocks(blocks, filters), [blocks, filters]);
  const dayMode = viewMode === 'day';

  return (
    <div className="rounded-card bg-surface shadow-card">
      {dayMode ? null : (
        <div
          className="sticky top-(--nav-height) z-20 flex rounded-t-card border-b border-separator bg-surface pl-12"
          aria-hidden="true"
        >
          {dates.map((date) => {
            const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
            const isToday = date === today;
            return (
              <div
                key={date}
                className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5 border-l border-separator py-2 first:border-l-0"
              >
                <span className="text-footnote font-medium text-label-secondary">
                  {WEEKDAY_SHORT[dow]}
                </span>
                <span
                  className={cn(
                    'flex size-7 items-center justify-center rounded-full text-headline font-semibold tabular-nums',
                    isToday && 'bg-accent text-on-accent',
                  )}
                >
                  {Number(date.slice(8))}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex overflow-hidden rounded-b-card">
        {/* Hour gutter */}
        <div
          aria-hidden="true"
          className="relative w-12 shrink-0"
          style={{ height: gridHeight(bounds) }}
        >
          {hourLabels(bounds)
            .slice(0, -1)
            .map((hour, index) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[0.6875rem] text-label-tertiary tabular-nums first:translate-y-0.5"
                style={{ top: index * HOUR_HEIGHT }}
              >
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
        </div>

        <motion.div
          key={dayMode ? dates[0] : 'week'}
          className="flex min-w-0 flex-1 touch-pan-y"
          aria-label={dayMode && dates[0] ? dayLabel(dates[0]) : 'Semana'}
          // Day view: swipe sideways to change the day. The page keeps scrolling vertically.
          drag={dayMode ? 'x' : false}
          dragControls={dragControls}
          dragListener={false}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.35}
          dragSnapToOrigin
          onPointerDown={(event) => {
            // Blocks have their own drag; a swipe starts only on empty calendar space.
            if (dayMode && !(event.target as Element).closest('[data-no-swipe]'))
              dragControls.start(event);
          }}
          onDragEnd={(_event, info) => {
            // Decide from where the gesture is *going*, not just where it was released.
            const projected = info.offset.x + projectMomentum(info.velocity.x);
            if (Math.abs(projected) < SWIPE_THRESHOLD) return;
            dispatch(dayShifted({ days: projected < 0 ? 1 : -1, today }));
          }}
          initial={dayMode && !reducedMotion ? { opacity: 0.4 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
        >
          {dates.map((date) => (
            <DayColumn
              key={date}
              date={date}
              bounds={bounds}
              prefs={prefs}
              commitments={commitments}
              blocks={visibleBlocks}
              now={now}
              isToday={date === today}
              renderBlock={renderBlock}
              overlay={renderOverlay?.(date)}
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
}
