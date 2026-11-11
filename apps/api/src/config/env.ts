import { AI_PLANNING_STRATEGIES, DEFAULT_TIMEZONE, isValidTimeZone } from '@routinely/shared';
import { z } from 'zod';

/** Fixed single user of the MVP (no login). Every row points to it. */
export const SEED_USER_ID = '00000000-0000-4000-8000-000000000001';

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

export const envSchema = z.object({
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
});

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
