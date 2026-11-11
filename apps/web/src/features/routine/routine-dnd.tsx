'use client';

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragMoveEvent,
} from '@dnd-kit/core';
import {
  GRID_MINUTES,
  MINUTE_MS,
  checkPlacement,
  utcToZonedParts,
  type DateString,
  type FixedCommitment,
  type PlacementViolation,
  type Preferences,
  type RoutineBlock,
} from '@routinely/shared';
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import { useToast } from '@/components/ui';
import { boxFor, deltaToMinutes, gridBounds, instantAt } from '@/features/calendar/layout';
import { cn } from '@/lib/cn';
import {
  dragEnded,
  dragPreviewed,
  dragStarted,
  selectDrag,
  type DragKind,
} from '@/lib/store/drag-slice';
import { useAppDispatch, useAppSelector } from '@/lib/store/hooks';
import { useMoveBlock, violationMessage } from './api';

interface Preview {
  start: number;
  end: number;
  violations: PlacementViolation[];
}

interface RoutineDndApi {
  prefs: Preferences;
  /** True while a routine is being generated: blocks cannot be moved, locked or completed. */
  locked: boolean;
  /** Validates a candidate placement of `block` (pure; no state change). */
  check: (block: RoutineBlock, start: number, end: number) => PlacementViolation[];
  begin: (block: RoutineBlock, kind: DragKind) => void;
  /** Updates the live preview; the calendar shows conflicts as the user drags. */
  preview: (block: RoutineBlock, start: number, end: number) => void;
  /** Applies the last preview if it is valid; otherwise explains why not. */
  commit: (block: RoutineBlock) => void;
  cancel: () => void;
}

const RoutineDndContext = createContext<RoutineDndApi | null>(null);

export function useRoutineDnd(): RoutineDndApi {
  const context = useContext(RoutineDndContext);
  if (!context) throw new Error('useRoutineDnd must be used inside <RoutineDndProvider>');
  return context;
}

interface ProviderProps {
  prefs: Preferences;
  commitments: readonly FixedCommitment[];
  blocks: readonly RoutineBlock[];
  /** A generation is running (the server answers 409 to block edits meanwhile). */
  locked?: boolean;
  children: ReactNode;
}

/**
 * Drag & drop for task blocks. Every pointer move is validated with the same
 * `checkPlacement` the API uses, so conflicts show up *while* dragging; a valid
 * drop is applied optimistically and rolled back if the server disagrees.
 */
export function RoutineDndProvider({
  prefs,
  commitments,
  blocks,
  locked = false,
  children,
}: ProviderProps) {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const move = useMoveBlock();
  const latest = useRef<Preview | null>(null);

  const sensors = useSensors(
    // A few pixels of hysteresis keep a click from turning into a drag.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On touch, press-and-hold picks the block up, so swiping still scrolls.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const check = useCallback(
    (block: RoutineBlock, start: number, end: number) =>
      checkPlacement(
        { start, end },
        {
          prefs,
          commitments,
          otherBlocks: blocks
            .filter((other) => other.id !== block.id)
            .map((other) => ({ start: Date.parse(other.start), end: Date.parse(other.end) })),
          deadline: Date.parse(block.task.deadline),
          now: Date.now(),
        },
      ),
    [prefs, commitments, blocks],
  );

  const api = useMemo<RoutineDndApi>(
    () => ({
      prefs,
      locked,
      check,
      begin: (block, kind) => {
        latest.current = null;
        dispatch(dragStarted({ blockId: block.id, kind }));
      },
      preview: (block, start, end) => {
        const previous = latest.current;
        if (previous && previous.start === start && previous.end === end) return;
        const next = { start, end, violations: check(block, start, end) };
        latest.current = next;
        dispatch(dragPreviewed(next));
      },
      commit: (block) => {
        const result = latest.current;
        latest.current = null;
        dispatch(dragEnded());
        if (!result) return;
        if (result.start === Date.parse(block.start) && result.end === Date.parse(block.end))
          return;
        if (result.violations.length > 0) {
          toast.error(violationMessage(result.violations));
          return;
        }
        move.mutate({ blockId: block.id, start: result.start, end: result.end });
      },
      cancel: () => {
        latest.current = null;
        dispatch(dragEnded());
      },
    }),
    [prefs, locked, check, dispatch, toast, move],
  );

  const onDragMove = ({ active, delta, over }: DragMoveEvent) => {
    const block = active.data.current?.block as RoutineBlock | undefined;
    if (!block) return;
    const origin = utcToZonedParts(Date.parse(block.start), prefs.timezone);
    const date = typeof over?.id === 'string' ? over.id : origin.date;
    const duration = Date.parse(block.end) - Date.parse(block.start);
    const start = instantAt(date, origin.minutes + deltaToMinutes(delta.y), prefs.timezone);
    api.preview(block, start, start + duration);
  };

  return (
    <RoutineDndContext.Provider value={api}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => {
          const block = active.data.current?.block as RoutineBlock | undefined;
          if (block) api.begin(block, 'move');
        }}
        onDragMove={onDragMove}
        onDragEnd={({ active }) => {
          const block = active.data.current?.block as RoutineBlock | undefined;
          if (block) api.commit(block);
          else api.cancel();
        }}
        onDragCancel={api.cancel}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Para mudar o horário pelo teclado, pressione Enter para abrir os detalhes do bloco e edite o início e o fim.',
          },
          announcements: {
            onDragStart: () => 'Bloco selecionado para mover.',
            onDragOver: () => undefined,
            onDragEnd: () => 'Bloco solto.',
            onDragCancel: () => 'Movimento cancelado.',
          },
        }}
      >
        {children}
      </DndContext>
    </RoutineDndContext.Provider>
  );
}

/**
 * Drop target covering one day column. While a block is dragged over it, shows
 * where the block would land, snapped to the grid — red when it conflicts.
 */
export function DayDropZone({ date }: { date: DateString }) {
  const { prefs } = useRoutineDnd();
  const { setNodeRef } = useDroppable({ id: date });
  const drag = useAppSelector(selectDrag);

  let ghost: ReactNode = null;
  if (drag.preview && drag.kind === 'move') {
    const start = utcToZonedParts(drag.preview.start, prefs.timezone);
    if (start.date === date) {
      const minutes = Math.max(GRID_MINUTES, (drag.preview.end - drag.preview.start) / MINUTE_MS);
      const box = boxFor(start.minutes, start.minutes + minutes, gridBounds(prefs));
      const conflict = drag.violations.length > 0;
      if (box) {
        ghost = (
          <div
            data-testid="drop-preview"
            data-conflict={conflict}
            className={cn(
              'absolute inset-x-1 rounded-[0.5rem] border-2 border-dashed',
              conflict ? 'border-danger bg-danger/10' : 'border-accent-text bg-accent/10',
            )}
            style={{ top: box.top + 1, height: box.height - 2 }}
          />
        );
      }
    }
  }

  return (
    <div ref={setNodeRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
      {ghost}
    </div>
  );
}
