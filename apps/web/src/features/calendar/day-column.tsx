import {
  timeToMinutes,
  type DateString,
  type FixedCommitment,
  type Preferences,
  type RoutineBlock,
} from '@routinely/shared';
import type { ReactNode } from 'react';
import { toneStyle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { CATEGORY_LABEL, WEEKDAY_LONG, formatDate } from '@/lib/labels';
import {
  HOUR_HEIGHT,
  blocksForDay,
  boxFor,
  commitmentsForDay,
  gridHeight,
  nowOffset,
  type GridBounds,
  type PositionedBlock,
} from './layout';

interface DayColumnProps {
  date: DateString;
  bounds: GridBounds;
  prefs: Preferences;
  commitments: readonly FixedCommitment[];
  blocks: readonly RoutineBlock[];
  now: number | null;
  isToday: boolean;
  renderBlock: (positioned: PositionedBlock) => ReactNode;
  /** Extra layers drawn above everything (e.g. the drag preview). */
  overlay?: ReactNode;
}

export function dayLabel(date: DateString): string {
  const weekday = WEEKDAY_LONG[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? '';
  return `${weekday}, ${formatDate(date, { day: 'numeric', month: 'long' })}`;
}

/** One day of the time grid: hour lines, lunch, fixed commitments and task blocks. */
export function DayColumn({
  date,
  bounds,
  prefs,
  commitments,
  blocks,
  now,
  isToday,
  renderBlock,
  overlay,
}: DayColumnProps) {
  const lunch = boxFor(timeToMinutes(prefs.lunchStart), timeToMinutes(prefs.lunchEnd), bounds);
  const dayCommitments = commitmentsForDay(date, commitments, bounds);
  const dayBlocks = blocksForDay(date, blocks, bounds, prefs.timezone);
  const nowTop = now === null ? null : nowOffset(date, now, bounds, prefs.timezone);
  const hours = (bounds.endMinutes - bounds.startMinutes) / 60;

  return (
    <section
      aria-label={dayLabel(date)}
      data-date={date}
      className={cn(
        'relative min-w-0 flex-1 border-l border-separator first:border-l-0',
        isToday && 'bg-accent/[0.03]',
      )}
      style={{ height: gridHeight(bounds) }}
    >
      {/* Hour lines */}
      <div aria-hidden="true" className="absolute inset-0">
        {Array.from({ length: hours }, (_, index) => (
          <div key={index} className="border-t border-separator" style={{ height: HOUR_HEIGHT }} />
        ))}
      </div>

      {lunch ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 flex items-center justify-center bg-fill text-[0.6875rem] font-medium text-label-tertiary"
          style={{ top: lunch.top, height: lunch.height }}
        >
          Almoço / descanso
        </div>
      ) : null}

      <ul className="contents">
        {dayCommitments.map(({ commitment, top, height }) => (
          <li
            key={commitment.id}
            style={{ ...toneStyle(commitment.color), top: top + 1, height: height - 2 }}
            className="tone-surface absolute inset-x-1 overflow-hidden rounded-[0.5rem] border border-dashed border-[color-mix(in_srgb,var(--tone)_40%,transparent)] px-2 py-1"
          >
            <span className="sr-only">Compromisso fixo: </span>
            <span className="block truncate text-caption font-semibold text-label">
              {commitment.title}
            </span>
            {height >= 40 ? (
              <span className="block truncate text-[0.6875rem] tabular-nums opacity-90">
                {commitment.startTime}–{commitment.endTime} · {CATEGORY_LABEL[commitment.category]}
              </span>
            ) : null}
          </li>
        ))}
        {dayBlocks.map((positioned) => (
          <li
            key={positioned.block.id}
            className="absolute inset-x-1"
            style={{ top: positioned.top + 1, height: positioned.height - 2 }}
          >
            {renderBlock(positioned)}
          </li>
        ))}
      </ul>

      {nowTop !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
          style={{ top: nowTop - 4 }}
        >
          <span className="-ml-1 size-2 rounded-full bg-danger" />
          <span className="h-px flex-1 bg-danger" />
        </div>
      ) : null}

      {overlay}
    </section>
  );
}
