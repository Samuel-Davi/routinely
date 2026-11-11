import { z } from 'zod';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const prioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof prioritySchema>;

export const TASK_STATUSES = ['TODO', 'SCHEDULED', 'DONE'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const ESTIMATION_STATUSES = ['PENDING', 'DONE', 'FAILED'] as const;
export const estimationStatusSchema = z.enum(ESTIMATION_STATUSES);
export type EstimationStatus = z.infer<typeof estimationStatusSchema>;

export const ESTIMATION_SOURCES = ['AI', 'MANUAL', 'HEURISTIC'] as const;
export const estimationSourceSchema = z.enum(ESTIMATION_SOURCES);
export type EstimationSource = z.infer<typeof estimationSourceSchema>;

export const ROUTINE_STATUSES = ['PENDING', 'READY', 'FAILED'] as const;
export const routineStatusSchema = z.enum(ROUTINE_STATUSES);
export type RoutineStatus = z.infer<typeof routineStatusSchema>;

export const ROUTINE_SOURCES = ['AI', 'AI_REPAIRED', 'HEURISTIC'] as const;
export const routineSourceSchema = z.enum(ROUTINE_SOURCES);
export type RoutineSource = z.infer<typeof routineSourceSchema>;

export const ROUTINE_TRIGGERS = ['GENERATE', 'REPLAN', 'RESTORE'] as const;
export const routineTriggerSchema = z.enum(ROUTINE_TRIGGERS);
export type RoutineTrigger = z.infer<typeof routineTriggerSchema>;

export const COMMITMENT_CATEGORIES = ['WORK', 'STUDY', 'HEALTH', 'PERSONAL', 'OTHER'] as const;
export const commitmentCategorySchema = z.enum(COMMITMENT_CATEGORIES);
export type CommitmentCategory = z.infer<typeof commitmentCategorySchema>;

export const COMMITMENT_COLORS = [
  'blue',
  'green',
  'orange',
  'purple',
  'pink',
  'teal',
  'red',
  'gray',
] as const;
export const commitmentColorSchema = z.enum(COMMITMENT_COLORS);
export type CommitmentColor = z.infer<typeof commitmentColorSchema>;

export const UNSCHEDULED_REASONS = [
  'DEADLINE_IMPOSSIBLE',
  'DEADLINE_PASSED',
  'TOO_LONG_FOR_BLOCK',
  'NO_FREE_TIME',
  'NOT_ESTIMATED',
] as const;
export const unscheduledReasonSchema = z.enum(UNSCHEDULED_REASONS);
export type UnscheduledReason = z.infer<typeof unscheduledReasonSchema>;

export const REPLAN_REASONS = [
  'OVERDUE_BLOCK',
  'NEW_TASK',
  'TASK_CHANGED',
  'SCHEDULE_CHANGED',
] as const;
export const replanReasonSchema = z.enum(REPLAN_REASONS);
export type ReplanReason = z.infer<typeof replanReasonSchema>;

export const PLACEMENT_VIOLATIONS = [
  'INVALID_RANGE',
  'OFF_GRID',
  'CROSSES_DAYS',
  'OUTSIDE_DAY_WINDOW',
  'OVERLAPS_LUNCH',
  'OVERLAPS_COMMITMENT',
  'OVERLAPS_BLOCK',
  'AFTER_DEADLINE',
  'EXCEEDS_MAX_BLOCK',
] as const;
export const placementViolationSchema = z.enum(PLACEMENT_VIOLATIONS);
export type PlacementViolation = z.infer<typeof placementViolationSchema>;

/** Numeric weight used to order by priority (higher = more important). */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
};
