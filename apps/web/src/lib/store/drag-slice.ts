import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PlacementViolation } from '@routinely/shared';

export type DragKind = 'move' | 'resize';

/** Live state of a block being dragged or resized on the calendar. */
export interface DragState {
  blockId: string | null;
  kind: DragKind | null;
  /** Where the block would land, epoch ms (already snapped to the grid). */
  preview: { start: number; end: number } | null;
  /** Why the preview is not allowed; empty means it can be dropped. */
  violations: PlacementViolation[];
}

const initialState: DragState = { blockId: null, kind: null, preview: null, violations: [] };

const dragSlice = createSlice({
  name: 'drag',
  initialState,
  reducers: {
    dragStarted(state, action: PayloadAction<{ blockId: string; kind: DragKind }>) {
      state.blockId = action.payload.blockId;
      state.kind = action.payload.kind;
      state.preview = null;
      state.violations = [];
    },
    dragPreviewed(
      state,
      action: PayloadAction<{ start: number; end: number; violations: PlacementViolation[] }>,
    ) {
      state.preview = { start: action.payload.start, end: action.payload.end };
      state.violations = action.payload.violations;
    },
    dragEnded: () => initialState,
  },
});

export const { dragStarted, dragPreviewed, dragEnded } = dragSlice.actions;
export const dragReducer = dragSlice.reducer;

type WithDrag = { drag: DragState };

export const selectDrag = (state: WithDrag) => state.drag;
export const selectDraggingBlockId = (state: WithDrag) => state.drag.blockId;
export const selectDragHasConflict = (state: WithDrag) => state.drag.violations.length > 0;
