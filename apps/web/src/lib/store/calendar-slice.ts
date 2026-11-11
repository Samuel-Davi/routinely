import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { addDays, startOfWeek, weekDates, type DateString, type Priority } from '@routinely/shared';

export type ViewMode = 'week' | 'day';

export interface CalendarState {
  /** Day in focus (`YYYY-MM-DD`). `null` until the client knows "today". */
  selectedDate: DateString | null;
  /** `week` on wide screens, `day` on phones; the user can override on desktop. */
  viewMode: ViewMode;
  /** Whether the current mode was picked by the user (wins over the breakpoint). */
  viewModePinned: boolean;
  filters: {
    showCompleted: boolean;
    priorities: Priority[];
  };
}

const initialState: CalendarState = {
  selectedDate: null,
  viewMode: 'week',
  viewModePinned: false,
  filters: { showCompleted: true, priorities: [] },
};

const calendarSlice = createSlice({
  name: 'calendar',
  initialState,
  reducers: {
    dateSelected(state, action: PayloadAction<DateString>) {
      state.selectedDate = action.payload;
    },
    /** Sets "today" once, without overriding a date the user already picked. */
    todayResolved(state, action: PayloadAction<DateString>) {
      state.selectedDate ??= action.payload;
    },
    weekShifted(state, action: PayloadAction<{ weeks: number; today: DateString }>) {
      state.selectedDate = addDays(
        state.selectedDate ?? action.payload.today,
        action.payload.weeks * 7,
      );
    },
    dayShifted(state, action: PayloadAction<{ days: number; today: DateString }>) {
      state.selectedDate = addDays(state.selectedDate ?? action.payload.today, action.payload.days);
    },
    viewModeChosen(state, action: PayloadAction<ViewMode>) {
      state.viewMode = action.payload;
      state.viewModePinned = true;
    },
    /** The breakpoint changed; follow it unless the user pinned a mode on desktop. */
    viewportChanged(state, action: PayloadAction<{ compact: boolean }>) {
      if (action.payload.compact) {
        state.viewMode = 'day';
        state.viewModePinned = false;
      } else if (!state.viewModePinned) {
        state.viewMode = 'week';
      }
    },
    showCompletedToggled(state) {
      state.filters.showCompleted = !state.filters.showCompleted;
    },
    priorityFilterToggled(state, action: PayloadAction<Priority>) {
      const { priorities } = state.filters;
      const index = priorities.indexOf(action.payload);
      if (index >= 0) priorities.splice(index, 1);
      else priorities.push(action.payload);
    },
    filtersCleared(state) {
      state.filters = initialState.filters;
    },
  },
});

export const {
  dateSelected,
  todayResolved,
  weekShifted,
  dayShifted,
  viewModeChosen,
  viewportChanged,
  showCompletedToggled,
  priorityFilterToggled,
  filtersCleared,
} = calendarSlice.actions;
export const calendarReducer = calendarSlice.reducer;

type WithCalendar = { calendar: CalendarState };

export const selectSelectedDate = (state: WithCalendar) => state.calendar.selectedDate;
export const selectViewMode = (state: WithCalendar) => state.calendar.viewMode;
export const selectCalendarFilters = (state: WithCalendar) => state.calendar.filters;

export const selectWeekStart = createSelector([selectSelectedDate], (date) =>
  date ? startOfWeek(date) : null,
);

/** The seven dates of the visible week (memoised: stable array for the grid). */
export const selectWeekDates = createSelector([selectWeekStart], (weekStart) =>
  weekStart ? weekDates(weekStart) : [],
);

/** Dates actually rendered: the whole week, or just the selected day. */
export const selectVisibleDates = createSelector(
  [selectWeekDates, selectSelectedDate, selectViewMode],
  (week, selected, mode) => (mode === 'day' && selected ? [selected] : week),
);

export const selectActiveFilterCount = createSelector(
  [selectCalendarFilters],
  (filters) => filters.priorities.length + (filters.showCompleted ? 0 : 1),
);
