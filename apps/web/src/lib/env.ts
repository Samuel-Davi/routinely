import { DEFAULT_TIMEZONE } from '@routinely/shared';

/** Public runtime configuration (inlined by Next at build time). */
export const env = {
  // Same origin by default: `/api/*` is proxied to the API (see lib/api-proxy.ts), which keeps the
  // session cookies first-party. Set NEXT_PUBLIC_API_URL only to talk to an API directly.
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, ''),
  defaultTimezone: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE ?? DEFAULT_TIMEZONE,
} as const;
