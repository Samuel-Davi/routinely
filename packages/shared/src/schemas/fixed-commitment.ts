import { z } from 'zod';
import { commitmentCategorySchema, commitmentColorSchema } from '../enums';
import { dayOfWeekOf } from '../time';
import { dateStringSchema, idSchema, isoDateTimeSchema, timeStringSchema } from './common';

export const fixedCommitmentInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Informe um título').max(80, 'Máximo de 80 caracteres'),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Dias repetidos'),
    /** Set for a one-off commitment (YYYY-MM-DD, user's timezone); null for a weekly one. */
    date: dateStringSchema.nullable().default(null),
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    category: commitmentCategorySchema,
    color: commitmentColorSchema,
    /** Reserve travel time after this commitment (e.g. in-person classes). */
    requiresTravel: z.boolean().default(false),
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ['endTime'],
    message: 'O fim deve ser depois do início',
  })
  .refine((value) => value.date !== null || value.daysOfWeek.length > 0, {
    path: ['daysOfWeek'],
    message: 'Escolha ao menos um dia',
  })
  // A one-off commitment keeps its weekday in `daysOfWeek` so weekday-based views still work.
  .transform((value) => (value.date ? { ...value, daysOfWeek: [dayOfWeekOf(value.date)] } : value));
export type FixedCommitmentInput = z.infer<typeof fixedCommitmentInputSchema>;

export const fixedCommitmentSchema = z.object({
  id: idSchema,
  title: z.string(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  date: dateStringSchema.nullable(),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  category: commitmentCategorySchema,
  color: commitmentColorSchema,
  requiresTravel: z.boolean(),
  /** Other commitments that share time with this one (informational, never blocking). */
  overlapsWith: z
    .array(z.object({ id: idSchema, title: z.string(), daysOfWeek: z.array(z.number().int()) }))
    .default([]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type FixedCommitment = z.infer<typeof fixedCommitmentSchema>;
