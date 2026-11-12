import type {
  DateString,
  Interval,
  Priority,
  RoutineSource,
  SchedulingCommitment,
  SchedulingPreferences,
  UnscheduledReason,
} from '@routinely/shared';

/** A task as the engine sees it. All instants are epoch milliseconds. */
export interface EngineTask {
  id: string;
  title: string;
  priority: Priority;
  deadline: number;
  complexity: number;
  /** Minutes that still have to be allocated. */
  minutes: number;
  splittable: boolean;
}

export interface EngineBlock extends Interval {
  taskId: string;
  rationale?: string | null;
}

export interface PlanningContext {
  prefs: SchedulingPreferences;
  commitments: readonly SchedulingCommitment[];
  /** Inclusive planning range, calendar dates in the user's timezone. */
  rangeStart: DateString;
  rangeEnd: DateString;
  /** Nothing may be scheduled before this instant. */
  now: number;
  /** Blocks that stay where they are (locked, completed or past) and occupy time. */
  fixedBlocks: readonly EngineBlock[];
}

export interface EngineUnscheduled {
  taskId: string;
  reason: UnscheduledReason;
  missingMinutes: number;
}

/**
 * A task that was scheduled, but for fewer minutes than it needs because not all of it fits before
 * its deadline: the user still has to do it, in a shorter session, and is told so.
 */
export interface EngineShortfall {
  taskId: string;
  neededMinutes: number;
  allocatedMinutes: number;
  missingMinutes: number;
}

export interface PlanResult {
  blocks: EngineBlock[];
  /** Tasks with nothing scheduled at all (no usable time before the deadline). */
  unscheduled: EngineUnscheduled[];
  /** Tasks scheduled only in part. */
  shortfalls: EngineShortfall[];
  source: RoutineSource;
  /** Why the AI was not (fully) used, in Portuguese; null when it was. */
  notice: string | null;
}
