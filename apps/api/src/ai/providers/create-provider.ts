import type { AppConfig } from '../../config/config.module';
import type { LlmProvider } from '../llm-provider';
import { AnthropicProvider } from './anthropic.provider';
import { GeminiProvider } from './gemini.provider';
import { OllamaProvider } from './ollama.provider';

/** Picks the provider from `LLM_PROVIDER` (default `gemini`). */
export function createLlmProvider(config: AppConfig): LlmProvider {
  switch (config.LLM_PROVIDER) {
    case 'anthropic':
      return new AnthropicProvider({
        apiKey: config.ANTHROPIC_API_KEY,
        model: config.ANTHROPIC_MODEL,
      });
    case 'ollama':
      return new OllamaProvider({ baseUrl: config.OLLAMA_BASE_URL, model: config.OLLAMA_MODEL });
    case 'gemini':
    default:
      return new GeminiProvider({
        apiKey: config.GEMINI_API_KEY,
        model: config.GEMINI_MODEL,
        retryModel: config.GEMINI_RETRY_MODEL,
        timeoutMs: config.LLM_TIMEOUT_MS,
        maxOutputTokens: config.LLM_MAX_OUTPUT_TOKENS,
      });
  }
}
