import { ApiError, GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { LlmError, type LlmProvider, type ModelTier, type StructuredInput } from '../llm-provider';
import { parseStructured } from '../parse-structured';

export interface GeminiOptions {
  apiKey?: string;
  model: string;
  retryModel: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

/** The slice of the SDK this provider uses; lets tests inject a fake client. */
export interface GeminiClient {
  models: {
    generateContent(params: {
      model: string;
      contents: string;
      config: Record<string, unknown>;
    }): Promise<{ text?: string }>;
  };
}

/**
 * Gemini via `@google/genai` (works on the free tier, no billing).
 * Structured output: `responseMimeType: application/json` + `responseJsonSchema`
 * generated from the zod schema, then `zod.parse` on the answer.
 */
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';
  private client?: GeminiClient;

  constructor(
    private readonly options: GeminiOptions,
    client?: GeminiClient,
  ) {
    this.client = client;
  }

  isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  modelFor(tier: ModelTier): string {
    return tier === 'retry' ? this.options.retryModel : this.options.model;
  }

  async generateStructured<T>(input: StructuredInput<T>): Promise<T> {
    if (!this.isConfigured()) {
      throw new LlmError('UNAVAILABLE', 'GEMINI_API_KEY is not configured');
    }
    const { $schema: _ignored, ...responseJsonSchema } = z.toJSONSchema(input.schema) as Record<
      string,
      unknown
    >;

    let text: string | undefined;
    try {
      const response = await this.getClient().models.generateContent({
        model: this.modelFor(input.tier ?? 'default'),
        contents: input.prompt,
        config: {
          systemInstruction: input.system,
          responseMimeType: 'application/json',
          responseJsonSchema,
          temperature: 0.2,
          maxOutputTokens: this.options.maxOutputTokens,
          abortSignal: AbortSignal.timeout(this.options.timeoutMs),
          // Retries are handled by LlmClient (backoff with jitter), not by the SDK.
          httpOptions: { timeout: this.options.timeoutMs, retryOptions: { attempts: 1 } },
        },
      });
      text = response.text;
    } catch (error) {
      throw toLlmError(error);
    }
    return parseStructured(text, input.schema);
  }

  private getClient(): GeminiClient {
    this.client ??= new GoogleGenAI({ apiKey: this.options.apiKey }) as unknown as GeminiClient;
    return this.client;
  }
}

/** Maps SDK/transport failures to typed errors. Messages never contain the API key. */
export function toLlmError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof ApiError) {
    if (error.status === 429) return new LlmError('RATE_LIMIT', 'Gemini rate limit reached (429)');
    if (error.status === 408 || error.status === 504) {
      return new LlmError('TIMEOUT', `Gemini timed out (${error.status})`);
    }
    if (error.status === 401 || error.status === 403) {
      return new LlmError('UNAVAILABLE', `Gemini rejected the credentials (${error.status})`);
    }
    if (error.status >= 500) {
      return new LlmError('UNAVAILABLE', `Gemini is unavailable (${error.status})`);
    }
    return new LlmError('PROVIDER', `Gemini request failed (${error.status})`);
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new LlmError('TIMEOUT', 'Gemini request timed out');
  }
  return new LlmError('PROVIDER', 'Gemini request failed');
}
