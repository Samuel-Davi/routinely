import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CreateTaskInput, FixedCommitmentInput } from '@routinely/shared';

/** Which sheet/modal is open. IDs only: the entity itself lives in TanStack Query. */
export type Panel =
  | { type: 'task-form'; taskId?: string }
  | { type: 'commitment-form'; commitmentId?: string }
  | { type: 'block-details'; blockId: string }
  | { type: 'generate-routine'; mode?: 'replan' }
  | { type: 'calendar-filters' };

export interface UiState {
  panel: Panel | null;
  /** Unsaved "new item" forms, kept if the sheet is dismissed by accident. */
  drafts: {
    task: Partial<CreateTaskInput> | null;
    commitment: Partial<FixedCommitmentInput> | null;
  };
  /** Routine version whose generation the UI is waiting for. */
  pendingRoutineId: string | null;
  /** The replan suggestion the user dismissed (keyed by routine id). */
  dismissedSuggestionFor: string | null;
  /** Commitment the task list is filtered by (null = all). */
  taskCommitmentFilter: string | null;
}

const initialState: UiState = {
  panel: null,
  drafts: { task: null, commitment: null },
  pendingRoutineId: null,
  dismissedSuggestionFor: null,
  taskCommitmentFilter: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    panelOpened(state, action: PayloadAction<Panel>) {
      state.panel = action.payload;
    },
    panelClosed(state) {
      state.panel = null;
    },
    taskDraftSaved(state, action: PayloadAction<Partial<CreateTaskInput> | null>) {
      state.drafts.task = action.payload;
    },
    commitmentDraftSaved(state, action: PayloadAction<Partial<FixedCommitmentInput> | null>) {
      state.drafts.commitment = action.payload;
    },
    routineJobStarted(state, action: PayloadAction<string>) {
      state.pendingRoutineId = action.payload;
      state.dismissedSuggestionFor = null;
    },
    routineJobSettled(state) {
      state.pendingRoutineId = null;
    },
    taskCommitmentFilterSet(state, action: PayloadAction<string | null>) {
      state.taskCommitmentFilter = action.payload;
    },
    suggestionDismissed(state, action: PayloadAction<string>) {
      state.dismissedSuggestionFor = action.payload;
    },
  },
});

export const {
  panelOpened,
  panelClosed,
  taskDraftSaved,
  commitmentDraftSaved,
  routineJobStarted,
  routineJobSettled,
  suggestionDismissed,
  taskCommitmentFilterSet,
} = uiSlice.actions;
export const uiReducer = uiSlice.reducer;

type WithUi = { ui: UiState };

export const selectPanel = (state: WithUi) => state.ui.panel;
export const selectTaskDraft = (state: WithUi) => state.ui.drafts.task;
export const selectCommitmentDraft = (state: WithUi) => state.ui.drafts.commitment;
export const selectPendingRoutineId = (state: WithUi) => state.ui.pendingRoutineId;
export const selectDismissedSuggestionFor = (state: WithUi) => state.ui.dismissedSuggestionFor;
export const selectTaskCommitmentFilter = (state: WithUi) => state.ui.taskCommitmentFilter;
