import {
  dateSelected,
  dayShifted,
  filtersCleared,
  priorityFilterToggled,
  selectActiveFilterCount,
  selectVisibleDates,
  selectWeekDates,
  selectWeekStart,
  showCompletedToggled,
  todayResolved,
  viewModeChosen,
  viewportChanged,
  weekShifted,
} from './calendar-slice';
import {
  dragEnded,
  dragPreviewed,
  dragStarted,
  selectDrag,
  selectDragHasConflict,
  selectDraggingBlockId,
} from './drag-slice';
import { makeStore, readStoredViewMode } from './store';
import {
  panelClosed,
  panelOpened,
  routineJobSettled,
  routineJobStarted,
  selectDismissedSuggestionFor,
  selectPanel,
  selectPendingRoutineId,
  selectTaskDraft,
  suggestionDismissed,
  taskDraftSaved,
} from './ui-slice';

const today = '2026-11-10'; // Tuesday

describe('calendar slice', () => {
  it('resolves today once and derives the Monday-based week', () => {
    const store = makeStore();
    expect(selectWeekStart(store.getState())).toBeNull();
    expect(selectWeekDates(store.getState())).toEqual([]);

    store.dispatch(todayResolved(today));
    store.dispatch(todayResolved('2026-12-25'));
    expect(store.getState().calendar.selectedDate).toBe(today);
    expect(selectWeekStart(store.getState())).toBe('2026-11-09');
    expect(selectWeekDates(store.getState())).toHaveLength(7);
    expect(selectWeekDates(store.getState())[6]).toBe('2026-11-15');
  });

  it('navigates by week and by day', () => {
    const store = makeStore();
    store.dispatch(weekShifted({ weeks: 1, today }));
    expect(store.getState().calendar.selectedDate).toBe('2026-11-17');
    store.dispatch(weekShifted({ weeks: -2, today }));
    expect(store.getState().calendar.selectedDate).toBe('2026-11-03');
    store.dispatch(dayShifted({ days: 1, today }));
    expect(store.getState().calendar.selectedDate).toBe('2026-11-04');
    store.dispatch(dateSelected('2026-11-15'));
    expect(selectWeekStart(store.getState())).toBe('2026-11-09');
  });

  it('memoises derived dates', () => {
    const store = makeStore();
    store.dispatch(todayResolved(today));
    const first = selectWeekDates(store.getState());
    store.dispatch(dateSelected('2026-11-12')); // same week
    expect(selectWeekDates(store.getState())).toBe(first);
  });

  it('shows one day in day mode and the week otherwise', () => {
    const store = makeStore();
    store.dispatch(todayResolved(today));
    expect(selectVisibleDates(store.getState())).toHaveLength(7);
    store.dispatch(viewModeChosen('day'));
    expect(selectVisibleDates(store.getState())).toEqual([today]);
  });

  it('follows the viewport unless the user pinned a mode on desktop', () => {
    const store = makeStore();
    store.dispatch(viewportChanged({ compact: true }));
    expect(store.getState().calendar.viewMode).toBe('day');
    store.dispatch(viewportChanged({ compact: false }));
    expect(store.getState().calendar.viewMode).toBe('week');

    store.dispatch(viewModeChosen('day'));
    store.dispatch(viewportChanged({ compact: false }));
    expect(store.getState().calendar.viewMode).toBe('day');
  });

  it('persists the chosen view mode through the listener middleware', () => {
    expect(readStoredViewMode()).toBeNull();
    makeStore().dispatch(viewModeChosen('day'));
    expect(readStoredViewMode()).toBe('day');
    localStorage.setItem('routinely:view-mode', 'month');
    expect(readStoredViewMode()).toBeNull();
  });

  it('toggles filters and counts the active ones', () => {
    const store = makeStore();
    expect(selectActiveFilterCount(store.getState())).toBe(0);
    store.dispatch(priorityFilterToggled('URGENT'));
    store.dispatch(priorityFilterToggled('HIGH'));
    store.dispatch(priorityFilterToggled('URGENT'));
    store.dispatch(showCompletedToggled());
    expect(store.getState().calendar.filters).toEqual({
      showCompleted: false,
      priorities: ['HIGH'],
    });
    expect(selectActiveFilterCount(store.getState())).toBe(2);
    store.dispatch(filtersCleared());
    expect(selectActiveFilterCount(store.getState())).toBe(0);
  });
});

describe('ui slice', () => {
  it('opens and closes panels by id only', () => {
    const store = makeStore();
    store.dispatch(panelOpened({ type: 'task-form', taskId: 't1' }));
    expect(selectPanel(store.getState())).toEqual({ type: 'task-form', taskId: 't1' });
    store.dispatch(panelClosed());
    expect(selectPanel(store.getState())).toBeNull();
  });

  it('keeps drafts and tracks the routine job', () => {
    const store = makeStore();
    store.dispatch(taskDraftSaved({ title: 'Rascunho' }));
    expect(selectTaskDraft(store.getState())).toEqual({ title: 'Rascunho' });

    store.dispatch(suggestionDismissed('r1'));
    expect(selectDismissedSuggestionFor(store.getState())).toBe('r1');
    store.dispatch(routineJobStarted('r2'));
    expect(selectPendingRoutineId(store.getState())).toBe('r2');
    expect(selectDismissedSuggestionFor(store.getState())).toBeNull();
    store.dispatch(routineJobSettled());
    expect(selectPendingRoutineId(store.getState())).toBeNull();
  });
});

describe('drag slice', () => {
  it('tracks the preview and its conflicts, then resets', () => {
    const store = makeStore();
    store.dispatch(dragStarted({ blockId: 'b1', kind: 'move' }));
    expect(selectDraggingBlockId(store.getState())).toBe('b1');
    expect(selectDragHasConflict(store.getState())).toBe(false);

    store.dispatch(dragPreviewed({ start: 1, end: 2, violations: ['OVERLAPS_COMMITMENT'] }));
    expect(selectDrag(store.getState())).toMatchObject({
      preview: { start: 1, end: 2 },
      kind: 'move',
    });
    expect(selectDragHasConflict(store.getState())).toBe(true);

    store.dispatch(dragEnded());
    expect(selectDrag(store.getState())).toEqual({
      blockId: null,
      kind: null,
      preview: null,
      violations: [],
    });
  });
});
