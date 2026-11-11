import { z } from 'zod';
import { DATE_REGEX, GRID_MINUTES, LOCAL_DATETIME_REGEX, TIME_REGEX } from '../time';

export const idSchema = z.uuid();
export const timeStringSchema = z.string().regex(TIME_REGEX, 'Use o formato HH:mm');
export const dateStringSchema = z.string().regex(DATE_REGEX, 'Use o formato AAAA-MM-DD');
export const localDateTimeSchema = z
  .string()
  .regex(LOCAL_DATETIME_REGEX, 'Use o formato AAAA-MM-DDTHH:mm');
export const isoDateTimeSchema = z.iso.datetime({ offset: true, message: 'Data/hora inválida' });

export const gridMinutesSchema = (min: number, max: number) =>
  z
    .number()
    .int()
    .min(min, `Mínimo de ${min} minutos`)
    .max(max, `Máximo de ${max} minutos`)
    .multipleOf(GRID_MINUTES, `Use múltiplos de ${GRID_MINUTES} minutos`);

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
