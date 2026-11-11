import { DEFAULT_TIMEZONE } from '@routinely/shared';

/** Public runtime configuration (inlined by Next at build time). */
export const env = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, ''),
  defaultTimezone: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ?? DEFAULT_TIMEZONE,
} as const;
