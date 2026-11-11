import { z } from 'zod';
import {
  estimationSourceSchema,
  estimationStatusSchema,
  prioritySchema,
  taskStatusSchema,
} from '../enums';
import { gridMinutesSchema, idSchema, isoDateTimeSchema } from './common';

export const MAX_ESTIMATED_MINUTES = 40 * 60;

export const complexitySchema = z.number().int().min(1).max(5);
export const estimatedMinutesSchema = gridMinutesSchema(15, MAX_ESTIMATED_MINUTES);

const taskFields = {
  title: z.string().trim().min(1, 'Informe um título').max(120, 'Máximo de 120 caracteres'),
  description: z.string().trim().max(2000, 'Máximo de 2000 caracteres').default(''),
  priority: prioritySchema,
  deadline: isoDateTimeSchema,
  commitmentId: idSchema.nullish(),
};

export const createTaskSchema = z.object(taskFields);
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

/** Manual override of the AI-generated fields. */
export const taskEstimateOverrideSchema = z.object({
  complexity: complexitySchema,
  estimatedMinutes: estimatedMinutesSchema,
  splittable: z.boolean(),
});
export type TaskEstimateOverride = z.infer<typeof taskEstimateOverrideSchema>;

export const updateTaskSchema = z
  .object({
    title: taskFields.title,
    description: z.string().trim().max(2000, 'Máximo de 2000 caracteres'),
    priority: prioritySchema,
    deadline: isoDateTimeSchema,
    commitmentId: idSchema.nullable(),
    status: taskStatusSchema,
    estimate: taskEstimateOverrideSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nada para atualizar');
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: z.string(),
  priority: prioritySchema,
  deadline: isoDateTimeSchema,
  commitmentId: idSchema.nullable(),
  status: taskStatusSchema,
  complexity: complexitySchema.nullable(),
  estimatedMinutes: z.number().int().nullable(),
  splittable: z.boolean().nullable(),
  aiRationale: z.string().nullable(),
  estimationStatus: estimationStatusSchema,
  estimationSource: estimationSourceSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Task = z.infer<typeof taskSchema>;
