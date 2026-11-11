import { z } from 'zod';
import {
  placementViolationSchema,
  prioritySchema,
  replanReasonSchema,
  routineSourceSchema,
  routineStatusSchema,
  routineTriggerSchema,
  taskStatusSchema,
  unscheduledReasonSchema,
} from '../enums';
import { dateStringSchema, idSchema, isoDateTimeSchema } from './common';

export const routineBlockSchema = z.object({
  id: idSchema,
  routineId: idSchema,
  taskId: idSchema,
  start: isoDateTimeSchema,
  end: isoDateTimeSchema,
  locked: z.boolean(),
  completedAt: isoDateTimeSchema.nullable(),
  rationale: z.string().nullable(),
  task: z.object({
    id: idSchema,
    title: z.string(),
    priority: prioritySchema,
    status: taskStatusSchema,
    deadline: isoDateTimeSchema,
  }),
});
export type RoutineBlock = z.infer<typeof routineBlockSchema>;

export const unscheduledTaskSchema = z.object({
  taskId: idSchema,
  title: z.string(),
  reason: unscheduledReasonSchema,
  missingMinutes: z.number().int().nonnegative(),
});
export type UnscheduledTask = z.infer<typeof unscheduledTaskSchema>;

export const routineDiffSchema = z.object({
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  moved: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
});
export type RoutineDiff = z.infer<typeof routineDiffSchema>;

export const routineSummarySchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  status: routineStatusSchema,
  source: routineSourceSchema.nullable(),
  trigger: routineTriggerSchema,
  active: z.boolean(),
  rangeStart: dateStringSchema,
  rangeEnd: dateStringSchema,
  diffSummary: routineDiffSchema.nullable(),
  unscheduled: z.array(unscheduledTaskSchema),
  /** Human-readable note, e.g. why the AI was not used. */
  notice: z.string().nullable(),
  blockCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
});
export type RoutineSummary = z.infer<typeof routineSummarySchema>;

export const routineSchema = routineSummarySchema.extend({
  blocks: z.array(routineBlockSchema),
});
export type Routine = z.infer<typeof routineSchema>;

/** `GET /routines/active`: wrapped so "no routine yet" is a regular JSON body. */
export const activeRoutineSchema = z.object({ routine: routineSchema.nullable() });
export type ActiveRoutine = z.infer<typeof activeRoutineSchema>;

export const lockBlockSchema = z.object({ locked: z.boolean() });
export type LockBlockInput = z.infer<typeof lockBlockSchema>;

export const generateRoutineInputSchema = z.object({
  /** Any date inside the week to plan; defaults to the current week. */
  weekStart: dateStringSchema.optional(),
  /** Plan up to the latest open deadline (capped at 4 weeks). */
  untilLastDeadline: z.boolean().default(false),
});
export type GenerateRoutineInput = z.infer<typeof generateRoutineInputSchema>;

export const moveBlockSchema = z
  .object({ start: isoDateTimeSchema, end: isoDateTimeSchema })
  .refine((value) => Date.parse(value.end) > Date.parse(value.start), {
    path: ['end'],
    message: 'O fim deve ser depois do início',
  });
export type MoveBlockInput = z.infer<typeof moveBlockSchema>;

export const completeBlockSchema = z.object({ completed: z.boolean() });
export type CompleteBlockInput = z.infer<typeof completeBlockSchema>;

export const replanSuggestionSchema = z.object({
  needsReplan: z.boolean(),
  reasons: z.array(z.object({ code: replanReasonSchema, count: z.number().int().positive() })),
});
export type ReplanSuggestion = z.infer<typeof replanSuggestionSchema>;

export const placementErrorDetailsSchema = z.object({
  violations: z.array(placementViolationSchema),
});
export type PlacementErrorDetails = z.infer<typeof placementErrorDetailsSchema>;
