import type { RoutineBlock } from '@routinely/shared';
import type { CSSProperties } from 'react';
import { Icon, toneStyle } from '@/components/ui';
import { lineStyle, useLine } from './lines';
import { cn } from '@/lib/cn';
import { PRIORITY_LABEL, formatTime } from '@/lib/labels';
import { isBlockDone } from './layout';

interface TaskBlockViewProps {
  block: RoutineBlock;
  timezone: string;
  height: number;
  /** Overrides the displayed time range while dragging/resizing. */
  preview?: { start: number; end: number };
  dragging?: boolean;
  conflict?: boolean;
  /** Just placed or moved by the last run: holds the interchange highlight. */
  changed?: boolean;
  /** Its task is picked in the side panel. */
  focused?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * What a screen reader hears for a block. The commitment is spoken too: on screen it is only
 * the colour of a dot, and colour alone must not carry information.
 */
export function blockAccessibleName(
  block: RoutineBlock,
  timezone: string,
  commitment?: string,
): string {
  const parts = [
    `Tarefa: ${block.task.title}`,
    `${formatTime(block.start, timezone)} às ${formatTime(block.end, timezone)}`,
    `prioridade ${PRIORITY_LABEL[block.task.priority].toLowerCase()}`,
  ];
  if (commitment) parts.push(commitment);
  if (isBlockDone(block)) parts.push('concluído');
  if (block.locked) parts.push('travado');
  return parts.join(', ');
}

/**
 * Visual of a task block on the grid: a white task card with a check circle, the title, the time
 * and a dot in its commitment's colour. Urgency is a word, never a colour. Interaction is added
 * by the parent.
 */
export function TaskBlockView({
  block,
  timezone,
  height,
  preview,
  dragging,
  conflict,
  changed,
  focused,
  className,
  style,
}: TaskBlockViewProps) {
  const line = useLine(block.task.commitmentId);
  const done = isBlockDone(block);
  const compact = height < 40;
  const start = preview?.start ?? block.start;
  const end = preview?.end ?? block.end;
  const urgent = block.task.priority === 'URGENT' || block.task.priority === 'HIGH';

  return (
    <div
      style={{ ...(conflict ? toneStyle('red') : lineStyle(line)), ...style }}
      className={cn(
        'relative flex h-full w-full overflow-hidden rounded-[0.375rem] bg-surface-raised pl-1.5 text-left shadow-card',
        compact ? 'items-center gap-1.5 pr-1.5' : 'flex-col gap-0.5 py-1 pr-1.5',
        done && 'opacity-60',
        dragging && 'shadow-float',
        conflict && 'outline-2 outline-offset-1 outline-danger',
        changed && 'station-changed',
        focused && !changed && 'station-focused',
        className,
      )}
    >
      <span
        className={cn(
          'flex min-w-0 gap-1.5 text-caption font-semibold text-label',
          compact ? 'items-center' : 'items-start',
          done && 'text-label-secondary line-through',
        )}
      >
        {done ? (
          <span
            aria-hidden="true"
            className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
          >
            <Icon name="check" size={10} strokeWidth={3.5} />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              'size-3.5 shrink-0 rounded-full border-[1.5px] border-label-tertiary',
              !compact && 'mt-px',
            )}
          />
        )}
        <span
          className={cn(
            // The title grows with the block: one line when short, up to three when there is room.
            height < 40
              ? 'truncate'
              : height < 70 || (urgent && !done)
                ? 'line-clamp-2'
                : 'line-clamp-3',
          )}
        >
          {block.task.title}
        </span>
      </span>
      {/* Short blocks give the title the width: the grid's axis already tells the time. */}
      {compact ? (
        block.locked ? (
          <Icon name="lock" size={12} strokeWidth={2.5} className="shrink-0 text-label-secondary" />
        ) : null
      ) : (
        <span className="flex min-w-0 shrink-0 items-center gap-1 pl-0.5 text-caption whitespace-nowrap tabular-nums text-label-secondary">
          <span
            aria-hidden="true"
            title={line.title}
            className="size-2 shrink-0 rounded-full bg-(--tone)"
          />
          <span className="truncate">
            {formatTime(start, timezone)}–{formatTime(end, timezone)}
          </span>
          {block.locked ? (
            <Icon name="lock" size={12} strokeWidth={2.5} className="shrink-0" />
          ) : null}
        </span>
      )}
      {urgent && height >= 60 && !done ? (
        <span
          className={cn(
            'truncate pl-0.5 text-caption font-semibold',
            block.task.priority === 'URGENT' ? 'text-danger' : 'text-label-secondary',
          )}
        >
          {PRIORITY_LABEL[block.task.priority]}
        </span>
      ) : null}
    </div>
  );
}
