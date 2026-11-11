import { LlmError, type LlmProvider, type ModelTier, type StructuredInput } from '../llm-provider';

export interface OllamaOptions {
  baseUrl: string;
  model: string;
}

/**
 * STUB — selected with `LLM_PROVIDER=ollama` (local LLM). Not implemented in the
 * MVP; every call fails with `UNAVAILABLE`, so the heuristic planner is used.
 *
 * To implement (no SDK needed):
 *  1. `POST ${baseUrl}/api/chat` with `{ model, stream: false, messages: [
 *     { role: 'system', content: input.system }, { role: 'user', content: input.prompt } ],
 *     format: z.toJSONSchema(input.schema), options: { temperature: 0.2 } }`.
 *  2. Parse `response.message.content` with `parseStructured(text, input.schema)`.
 *  3. Use `AbortSignal.timeout(timeoutMs)` and map failures to `LlmError`.
 *  4. In docker compose, add an `ollama` service and set
 *     `OLLAMA_BASE_URL=http://ollama:11434`.
 */
export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama';

  constructor(private readonly options: OllamaOptions) {}

  isConfigured(): boolean {
    return false;
  }

  modelFor(_tier: ModelTier): string {
    return this.options.model;
  }

  async generateStructured<T>(_input: StructuredInput<T>): Promise<T> {
    throw new LlmError('UNAVAILABLE', 'OllamaProvider is a documented stub (not implemented)');
  }
}
