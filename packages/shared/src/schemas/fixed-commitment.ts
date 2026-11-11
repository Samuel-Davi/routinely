import { z } from 'zod';
import { commitmentCategorySchema, commitmentColorSchema } from '../enums';
import { idSchema, isoDateTimeSchema, timeStringSchema } from './common';

export const fixedCommitmentInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Informe um título').max(80, 'Máximo de 80 caracteres'),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Escolha ao menos um dia')
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'Dias repetidos'),
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    category: commitmentCategorySchema,
    color: commitmentColorSchema,
  })
  .refine((value) => value.endTime > value.startTime, {
    path: ['endTime'],
    message: 'O fim deve ser depois do início',
  });
export type FixedCommitmentInput = z.infer<typeof fixedCommitmentInputSchema>;

export const fixedCommitmentSchema = z.object({
  id: idSchema,
  title: z.string(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  category: commitmentCategorySchema,
  color: commitmentColorSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type FixedCommitment = z.infer<typeof fixedCommitmentSchema>;
