import type { RoutineBlock } from '@routinely/shared';
import type { CSSProperties } from 'react';
import { Icon, toneStyle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PRIORITY_LABEL, PRIORITY_TONE, formatTime } from '@/lib/labels';
import { isBlockDone } from './layout';

interface TaskBlockViewProps {
  block: RoutineBlock;
  timezone: string;
  height: number;
  /** Overrides the displayed time range while dragging/resizing. */
  preview?: { start: number; end: number };
  dragging?: boolean;
  conflict?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function blockAccessibleName(block: RoutineBlock, timezone: string): string {
  const parts = [
    `Tarefa: ${block.task.title}`,
    `${formatTime(block.start, timezone)} às ${formatTime(block.end, timezone)}`,
    `prioridade ${PRIORITY_LABEL[block.task.priority].toLowerCase()}`,
  ];
  if (isBlockDone(block)) parts.push('concluído');
  if (block.locked) parts.push('travado');
  return parts.join(', ');
}

/** Visual of a task block on the grid. Interaction is added by its parent. */
export function TaskBlockView({
  block,
  timezone,
  height,
  preview,
  dragging,
  conflict,
  className,
  style,
}: TaskBlockViewProps) {
  const done = isBlockDone(block);
  const compact = height < 44;
  const start = preview?.start ?? block.start;
  const end = preview?.end ?? block.end;

  return (
    <div
      style={{ ...toneStyle(conflict ? 'red' : PRIORITY_TONE[block.task.priority]), ...style }}
      className={cn(
        // A quiet card: the priority is only the thin line on the left, not a coloured fill.
        'relative flex h-full w-full overflow-hidden rounded-[0.5rem] bg-surface-raised pl-3 text-left shadow-[0_0_0_1px_var(--hairline)]',
        compact ? 'items-center gap-1.5 pr-1.5' : 'flex-col gap-0.5 py-1 pr-1.5',
        done && 'opacity-55',
        dragging && 'shadow-float',
        conflict && 'outline-2 outline-danger',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="tone-solid absolute inset-y-1 left-1 w-[3px] rounded-full"
      />
      <span
        className={cn(
          'min-w-0 truncate text-caption font-semibold text-label',
          done && 'line-through',
        )}
      >
        {done ? (
          <Icon name="check" size={12} strokeWidth={3} className="mr-1 inline align-[-1px]" />
        ) : null}
        {block.task.title}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-caption tabular-nums text-label-secondary">
        {formatTime(start, timezone)}–{formatTime(end, timezone)}
        {block.locked ? <Icon name="lock" size={12} strokeWidth={2.5} /> : null}
      </span>
    </div>
  );
}
