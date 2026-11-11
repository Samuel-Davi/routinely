'use client';

import { utcToZonedParts, type DateString } from '@routinely/shared';
import { useEffect, useState } from 'react';
import { todayResolved, viewModeChosen, viewportChanged } from '@/lib/store/calendar-slice';
import { useAppDispatch } from '@/lib/store/hooks';
import { readStoredViewMode } from '@/lib/store/store';

/** Current time, refreshed every minute (enough for the "now" line). */
export function useNow(intervalMs = 60_000): number | null {
  // `null` on the server and first paint: the clock is only known on the client.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "Today" in the user's timezone; also seeds the selected date once. */
export function useToday(timeZone: string): DateString | null {
  const dispatch = useAppDispatch();
  const now = useNow();
  const today = now === null ? null : utcToZonedParts(now, timeZone).date;
  useEffect(() => {
    if (today) dispatch(todayResolved(today));
  }, [today, dispatch]);
  return today;
}

const COMPACT_QUERY = '(max-width: 767px)';

/** Keeps the view mode in sync with the breakpoint: day view on phones. */
export function useResponsiveViewMode(): void {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const stored = readStoredViewMode();
    if (!media.matches && stored) dispatch(viewModeChosen(stored));
    const sync = () => dispatch(viewportChanged({ compact: media.matches }));
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [dispatch]);
}
