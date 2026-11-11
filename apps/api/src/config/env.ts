import { randomBytes } from 'node:crypto';
import { AI_PLANNING_STRATEGIES, DEFAULT_TIMEZONE, isValidTimeZone } from '@routinely/shared';
import { z } from 'zod';

/** Fixed single user of the MVP (no login). Every row points to it. */
export const SEED_USER_ID = '00000000-0000-4000-8000-000000000001';

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  DEFAULT_USER_ID: z.uuid().default(SEED_USER_ID),
  DEFAULT_TIMEZONE: z
    .string()
    .refine(isValidTimeZone, 'Invalid IANA timezone')
    .default(DEFAULT_TIMEZONE),

  LLM_PROVIDER: z.enum(['gemini', 'anthropic', 'ollama']).default('gemini'),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  GEMINI_RETRY_MODEL: z.string().default('gemini-3.6-flash'),
  /** Thinking effort; unset = the model's default. Lower is faster and cheaper. */
  GEMINI_THINKING_LEVEL: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: z.string().default('claude-haiku-5-5'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.1'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).default(8192),
  /** Input budget for the routine prompt; the least urgent tasks beyond it go to the heuristic. */
  LLM_MAX_INPUT_TOKENS: z.coerce.number().int().min(500).default(12_000),
  /**
   * How the AI takes part in planning: `times` = it proposes exact times; `order` = it decides
   * order and split, the backend places; `order-day` (default, ADR-021) = same, plus a preferred day.
   */
  AI_PLANNING_STRATEGY: z.enum(AI_PLANNING_STRATEGIES).default('order-day'),
  LLM_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  LLM_BACKOFF_BASE_MS: z.coerce.number().int().min(0).default(1000),
  AI_RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1000).default(60_000),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  /** AI uses (estimations, generations, replans) per user and UTC day, to protect the free quota. */
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(40),
  /** AI uses across all users per UTC day. When reached, everyone gets the heuristic. */
  AI_GLOBAL_DAILY_LIMIT: z.coerce.number().int().min(0).default(200),

  /** Off for one-shot CLI processes: no resuming jobs or probing the AI provider at start. */
  BACKGROUND_JOBS_ENABLED: z.enum(['true', 'false']).default('true'),
  /** Open signup. Default: on in development, off in production (portfolio mode). */
  REGISTRATION_ENABLED: z.enum(['true', 'false']).optional(),
  /** Shows "Entrar como demo" (when the demo account exists). */
  DEMO_ENABLED: z.enum(['true', 'false']).default('false'),
  /** Credentials of the demo account, set by `pnpm demo:reset`. Never hard-coded. */
  DEMO_EMAIL: z.string().trim().toLowerCase().optional(),
  DEMO_PASSWORD: optionalSecret,
  /** Write limits of the demo account, so it cannot become a dumping ground. */
  DEMO_MAX_TASKS: z.coerce.number().int().min(1).default(15),
  DEMO_MAX_COMMITMENTS: z.coerce.number().int().min(1).default(20),

  /** Signs access tokens. Required in production (>= 32 chars); in dev a random one is used. */
  JWT_SECRET: optionalSecret,
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  /** `Secure` cookies. Default: on in production only (plain-http dev servers would drop them). */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Login/signup attempts per e-mail (twice that per IP) in each window. */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  AUTH_RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1000).default(900_000),
  /** Reverse proxies in front of the API whose X-Forwarded-For is trusted (for the client IP). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

export const envSchema = baseEnvSchema
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message:
          'is required in production and must have at least 32 characters (openssl rand -base64 48)',
      });
    }
  })
  .transform((env) => ({
    ...env,
    // Without a configured secret (dev/test only) sessions last until the process restarts.
    JWT_SECRET: env.JWT_SECRET ?? randomBytes(48).toString('base64url'),
    COOKIE_SECURE: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
    REGISTRATION_ENABLED: env.REGISTRATION_ENABLED
      ? env.REGISTRATION_ENABLED === 'true'
      : env.NODE_ENV !== 'production',
    DEMO_ENABLED: env.DEMO_ENABLED === 'true',
    BACKGROUND_JOBS_ENABLED: env.BACKGROUND_JOBS_ENABLED === 'true',
  }));

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

/** Parses and validates `process.env`. Never includes secret values in errors. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  return result.data;
}
