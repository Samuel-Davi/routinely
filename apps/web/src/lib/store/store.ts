import { combineReducers, configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { calendarReducer, viewModeChosen, type ViewMode } from './calendar-slice';
import { dragReducer } from './drag-slice';
import { uiReducer } from './ui-slice';

/**
 * Redux holds UI/client state only (selected week, view mode, drag, panels,
 * drafts). Everything that comes from the API lives in TanStack Query.
 */
const rootReducer = combineReducers({
  calendar: calendarReducer,
  ui: uiReducer,
  drag: dragReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

const VIEW_MODE_KEY = 'routinely:view-mode';

export function readStoredViewMode(): ViewMode | null {
  try {
    const value = globalThis.localStorage?.getItem(VIEW_MODE_KEY);
    return value === 'week' || value === 'day' ? value : null;
  } catch {
    return null;
  }
}

export function makeStore(preloadedState?: Partial<RootState>) {
  const listeners = createListenerMiddleware();

  // Remember the view mode the user explicitly picked.
  listeners.startListening({
    actionCreator: viewModeChosen,
    effect: (action) => {
      try {
        globalThis.localStorage?.setItem(VIEW_MODE_KEY, action.payload);
      } catch {
        // Storage may be unavailable (private mode); the preference is just not kept.
      }
    },
  });

  return configureStore({
    reducer: rootReducer,
    preloadedState: preloadedState as RootState | undefined,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listeners.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
