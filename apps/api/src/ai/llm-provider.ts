import type { z } from 'zod';

/** Which configured model to use: the cheap default or the stronger retry model. */
export type ModelTier = 'default' | 'retry';

export interface StructuredInput<T> {
  /** Use case name, for logs only (e.g. `estimateTask`). */
  name: string;
  system: string;
  prompt: string;
  /** The output is constrained to, and validated against, this schema. */
  schema: z.ZodType<T>;
  tier?: ModelTier;
}

/**
 * The only seam between the app and an LLM vendor. Implementations send the
 * request with a JSON schema, parse the JSON and validate it with zod.
 * They must throw an `LlmError` and never include credentials in messages.
 */
export interface LlmProvider {
  readonly name: string;
  /** Whether credentials/endpoint are configured. */
  isConfigured(): boolean;
  /** Model id used for a tier, for status/log output. */
  modelFor(tier: ModelTier): string;
  generateStructured<T>(input: StructuredInput<T>): Promise<T>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export type LlmErrorKind =
  /** HTTP 429 / quota exhausted. */
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  /** The model answered, but not with valid JSON for the schema. */
  | 'VALIDATION'
  /** Missing API key, stub provider or transient vendor outage. */
  | 'UNAVAILABLE'
  | 'PROVIDER';

export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
    /** Validation issues, fed back to the model on retry. */
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export const isLlmError = (error: unknown): error is LlmError => error instanceof LlmError;
