import { fromLocalDateTime, type SchedulingPreferences } from '@routinely/shared';
import type { EngineBlock, EngineTask, PlanningContext } from './types';

/** Shared test fixtures. 2026-11-09 is a Monday; the week ends on Sunday the 15th. */
export const prefs: SchedulingPreferences = {
  dayStart: '07:00',
  dayEnd: '22:00',
  maxFocusBlockMinutes: 90,
  minBreakMinutes: 15,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  timezone: 'America/Manaus',
};

export const at = (local: string): number => fromLocalDateTime(local, prefs.timezone);

export const block = (taskId: string, start: string, end: string): EngineBlock => ({
  taskId,
  start: at(start),
  end: at(end),
});

export function context(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    prefs,
    commitments: [],
    rangeStart: '2026-11-09',
    rangeEnd: '2026-11-15',
    now: at('2026-11-09T06:00'),
    fixedBlocks: [],
    ...overrides,
  };
}

export function task(id: string, overrides: Partial<EngineTask> = {}): EngineTask {
  return {
    id,
    title: `Tarefa ${id}`,
    priority: 'MEDIUM',
    deadline: at('2026-11-13T18:00'),
    complexity: 3,
    minutes: 60,
    splittable: true,
    ...overrides,
  };
}

/** Work 08–12 and 13–17 on weekdays. */
export const workWeek = [
  { id: 'work-am', daysOfWeek: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '12:00' },
  { id: 'work-pm', daysOfWeek: [1, 2, 3, 4, 5], startTime: '13:00', endTime: '17:00' },
];
