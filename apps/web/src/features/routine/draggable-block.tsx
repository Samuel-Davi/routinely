'use client';

import { useDraggable } from '@dnd-kit/core';
import { GRID_MINUTES, MINUTE_MS } from '@routinely/shared';
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  HOUR_HEIGHT,
  deltaToMinutes,
  isBlockDone,
  type PositionedBlock,
} from '@/features/calendar/layout';
import { TaskBlockView, blockAccessibleName } from '@/features/calendar/task-block';
import { cn } from '@/lib/cn';
import { selectDrag } from '@/lib/store/drag-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { panelOpened } from '@/lib/store/ui-slice';
import { useRoutineDnd } from './routine-dnd';

/**
 * A task block the user can pick up and move, or resize from its bottom edge.
 * It follows the pointer 1:1 while dragging; click or Enter opens its details,
 * which is also the keyboard path for changing its time.
 */
export function DraggableBlock({
  positioned,
  timezone,
}: {
  positioned: PositionedBlock;
  timezone: string;
}) {
  const { block, height } = positioned;
  const dispatch = useAppDispatch();
  const dnd = useRoutineDnd();
  const drag = useAppSelector(selectDrag);
  const done = isBlockDone(block);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    data: { block },
    disabled: done || dnd.locked,
  });

  // A drag ends with a click event on the same element; do not treat it as a tap.
  const suppressClick = useRef(false);
  useEffect(() => {
    if (isDragging) {
      suppressClick.current = true;
      return undefined;
    }
    // The click (if any) fires right after the release; then taps work again.
    const id = setTimeout(() => (suppressClick.current = false), 0);
    return () => clearTimeout(id);
  }, [isDragging]);

  const active = drag.blockId === block.id;
  const resizing = active && drag.kind === 'resize';
  const conflict = active && drag.violations.length > 0;
  const liveHeight =
    resizing && drag.preview
      ? ((drag.preview.end - drag.preview.start) / MINUTE_MS / 60) * HOUR_HEIGHT - 2
      : null;

  const openDetails = () => dispatch(panelOpened({ type: 'block-details', blockId: block.id }));

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dnd.locked) return;
    event.stopPropagation();
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const originY = event.clientY;
    const start = Date.parse(block.start);
    const originalEnd = Date.parse(block.end);
    dnd.begin(block, 'resize');

    const onMove = (moveEvent: PointerEvent) => {
      const end = Math.max(
        start + GRID_MINUTES * MINUTE_MS,
        originalEnd + deltaToMinutes(moveEvent.clientY - originY) * MINUTE_MS,
      );
      dnd.preview(block, start, end);
    };
    const finish = (commit: boolean) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      if (commit) dnd.commit(block);
      else dnd.cancel();
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-roledescription={done || dnd.locked ? undefined : 'bloco arrastável'}
      title={dnd.locked ? 'A rotina está sendo gerada. Aguarde para editar os blocos.' : undefined}
      aria-label={blockAccessibleName(block, timezone)}
      data-no-swipe
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        openDetails();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetails();
        }
      }}
      style={{
        // 1:1 with the pointer, on the compositor.
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        height: liveHeight ?? '100%',
      }}
      className={cn(
        'group relative w-full touch-manipulation select-none',
        done || dnd.locked ? 'cursor-pointer' : isDragging ? 'cursor-grabbing' : 'cursor-grab',
        (isDragging || resizing) && 'z-30',
      )}
    >
      <TaskBlockView
        block={block}
        timezone={timezone}
        height={liveHeight ?? height}
        preview={active && drag.preview ? drag.preview : undefined}
        dragging={isDragging || resizing}
        conflict={conflict}
      />
      {done || dnd.locked ? null : (
        <div
          data-testid="resize-handle"
          aria-hidden="true"
          onPointerDown={startResize}
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize touch-none items-end justify-center"
        >
          <span className="mb-0.5 h-0.5 w-6 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-40" />
        </div>
      )}
    </div>
  );
}
