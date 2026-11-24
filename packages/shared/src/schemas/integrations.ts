import { z } from 'zod';
import { prioritySchema } from '../enums';
import { dateStringSchema, idSchema, isoDateTimeSchema, timeStringSchema } from './common';

/** Prefix of every personal access token, so leaked ones are easy to recognise (and scan for). */
export const API_TOKEN_PREFIX = 'rtly_';

/** What a personal access token may do. Read-only by design (ADR-030). */
export const API_TOKEN_SCOPES = ['read:today'] as const;
export const apiTokenScopeSchema = z.enum(API_TOKEN_SCOPES);
export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;

export const createApiTokenSchema = z.object({
  label: z.string().trim().min(1, 'Dê um nome ao token').max(60, 'Máximo de 60 caracteres'),
});
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

/** A token as listed: never the token itself nor its hash. */
export const apiTokenSchema = z.object({
  id: idSchema,
  label: z.string(),
  /** First characters after `rtly_`, to tell tokens apart. */
  prefix: z.string(),
  scopes: z.array(apiTokenScopeSchema),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
});
export type ApiToken = z.infer<typeof apiTokenSchema>;

/** Returned once, on creation: the only time the plain token is ever shown. */
export const createdApiTokenSchema = apiTokenSchema.extend({ token: z.string() });
export type CreatedApiToken = z.infer<typeof createdApiTokenSchema>;

/** A real calendar date (rejects 2026-02-30), not just the `YYYY-MM-DD` shape. */
const calendarDateSchema = dateStringSchema.refine((date) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}, 'Data inexistente');

export const todayQuerySchema = z.object({ date: calendarDateSchema.optional() });
export type TodayQuery = z.infer<typeof todayQuerySchema>;

/** "HH:mm", or "24:00" for a block that runs past midnight (clipped to the day). */
const dayTimeSchema = z.union([timeStringSchema, z.literal('24:00')]);

/** `GET /integrations/today`: the contract read by external assistants (Jarvis). */
export const todaySchema = z.object({
  date: dateStringSchema,
  timezone: z.string(),
  blocks: z.array(
    z.object({
      start: dayTimeSchema,
      end: dayTimeSchema,
      title: z.string(),
      done: z.boolean(),
      locked: z.boolean(),
      priority: prioritySchema,
    }),
  ),
  commitments: z.array(
    z.object({
      start: timeStringSchema,
      end: timeStringSchema,
      title: z.string(),
      oneOff: z.boolean(),
    }),
  ),
  tasksDue: z.array(
    z.object({
      title: z.string(),
      dueDate: dateStringSchema,
      priority: prioritySchema,
      done: z.boolean(),
    }),
  ),
  routineNotice: z.string().nullable(),
});
export type Today = z.infer<typeof todaySchema>;
