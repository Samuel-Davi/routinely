import { z } from 'zod';
import { DEFAULT_TIMEZONE, isValidTimeZone } from '../time';
import { gridMinutesSchema, timeStringSchema } from './common';

export const preferencesSchema = z
  .object({
    dayStart: timeStringSchema,
    dayEnd: timeStringSchema,
    maxFocusBlockMinutes: gridMinutesSchema(15, 240),
    minBreakMinutes: gridMinutesSchema(0, 120),
    lunchStart: timeStringSchema,
    lunchEnd: timeStringSchema,
    /** Minutes reserved after the last commitment that requires travel; 0 disables it. */
    travelMinutes: gridMinutesSchema(0, 240).default(60),
    timezone: z.string().refine(isValidTimeZone, 'Fuso horário inválido'),
  })
  .refine((value) => value.dayEnd > value.dayStart, {
    path: ['dayEnd'],
    message: 'O fim do dia deve ser depois do início',
  })
  .refine((value) => value.lunchEnd >= value.lunchStart, {
    path: ['lunchEnd'],
    message: 'O fim do descanso não pode ser antes do início',
  });
export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  dayStart: '07:00',
  dayEnd: '22:00',
  maxFocusBlockMinutes: 90,
  minBreakMinutes: 15,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  travelMinutes: 60,
  timezone: DEFAULT_TIMEZONE,
};
