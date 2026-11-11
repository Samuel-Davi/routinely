import { LlmError, type LlmProvider, type ModelTier, type StructuredInput } from '../llm-provider';

export interface AnthropicOptions {
  apiKey?: string;
  model: string;
}

/**
 * STUB — selected with `LLM_PROVIDER=anthropic`. Not implemented in the MVP; every
 * call fails with `UNAVAILABLE`, so the app falls back to the heuristic planner.
 *
 * To implement:
 *  1. `pnpm --filter @routinely/api add @anthropic-ai/sdk`
 *  2. Call `client.messages.create({ model, max_tokens, system, messages, ... })`
 *     with structured outputs: `output_config: { format: { type: 'json_schema',
 *     schema: z.toJSONSchema(input.schema) } }` (or a single forced tool whose
 *     `input_schema` is that JSON schema).
 *  3. Parse the text block with `parseStructured(text, input.schema)`.
 *  4. Map `RateLimitError` → `LlmError('RATE_LIMIT')`, `APIConnectionTimeoutError`
 *     → `'TIMEOUT'`, and disable SDK retries (`maxRetries: 0`): LlmClient retries.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  constructor(private readonly options: AnthropicOptions) {}

  isConfigured(): boolean {
    return false;
  }

  modelFor(_tier: ModelTier): string {
    return this.options.model;
  }

  async generateStructured<T>(_input: StructuredInput<T>): Promise<T> {
    throw new LlmError('UNAVAILABLE', 'AnthropicProvider is a documented stub (not implemented)');
  }
}
