import {
  MINUTE_MS,
  timeToMinutes,
  travelInterval,
  utcToZonedParts,
  type DateString,
  type FixedCommitment,
  type Preferences,
  type RoutineBlock,
} from '@routinely/shared';
import type { ReactNode } from 'react';
import { toneStyle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { WEEKDAY_LONG, formatDate } from '@/lib/labels';
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
  const travelRange = travelInterval(date, commitments, prefs);
  const travelStart = travelRange ? utcToZonedParts(travelRange.start, prefs.timezone).minutes : 0;
  const travel = travelRange
    ? boxFor(travelStart, travelStart + (travelRange.end - travelRange.start) / MINUTE_MS, bounds)
    : null;
  const dayCommitments = commitmentsForDay(date, commitments, bounds);
  const dayBlocks = blocksForDay(date, blocks, bounds, prefs.timezone);
  const nowTop = now === null ? null : nowOffset(date, now, bounds, prefs.timezone);
  const hours = (bounds.endMinutes - bounds.startMinutes) / 60;

  return (
    <section
      aria-label={dayLabel(date)}
      data-date={date}
      className={cn(
        'relative min-w-0 flex-1 border-l border-hairline first:border-l-0',
        isToday && 'bg-accent/[0.03]',
      )}
      style={{ height: gridHeight(bounds) }}
    >
      {/* Hour lines */}
      <div aria-hidden="true" className="absolute inset-0">
        {Array.from({ length: hours }, (_, index) => (
          <div key={index} className="border-t border-hairline" style={{ height: HOUR_HEIGHT }} />
        ))}
      </div>

      {lunch ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 flex items-center justify-center bg-fill/50 text-caption text-label-tertiary"
          style={{ top: lunch.top, height: lunch.height }}
        >
          {lunch.height >= 40 ? 'Almoço' : null}
        </div>
      ) : null}

      {travel ? (
        <div
          data-testid="travel-band"
          className="absolute inset-x-0 flex items-center justify-center bg-fill/50 text-caption text-label-tertiary"
          style={{ top: travel.top, height: travel.height }}
        >
          {travel.height >= 28 ? 'Deslocamento' : <span className="sr-only">Deslocamento</span>}
        </div>
      ) : null}

      <ul className="contents">
        {dayCommitments.map(({ commitment, top, height }) => (
          <li
            key={commitment.id}
            style={{ ...toneStyle(commitment.color), top: top + 1, height: height - 2 }}
            // Fixed commitments recede: neutral, low contrast, only a small tint dot for category.
            className="absolute inset-x-1 overflow-hidden rounded-[0.5rem] bg-fill/70 px-2 py-1"
          >
            <span className="sr-only">Compromisso fixo: </span>
            <span className="flex items-center gap-1.5 truncate text-caption font-medium text-label-secondary">
              <span aria-hidden="true" className="tone-solid size-1.5 shrink-0 rounded-full" />
              <span className="truncate">{commitment.title}</span>
            </span>
            {height >= 44 ? (
              <span className="block truncate text-caption tabular-nums text-label-tertiary">
                {commitment.startTime}–{commitment.endTime}
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
