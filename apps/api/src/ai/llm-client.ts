import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.module';
import {
  LLM_PROVIDER,
  LlmError,
  isLlmError,
  type LlmProvider,
  type ModelResolutionReport,
  type ModelTier,
  type StructuredInput,
  type TokenUsage,
} from './llm-provider';

export interface LlmClientTiming {
  sleep(ms: number): Promise<void>;
  random(): number;
}

export const LLM_TIMING = Symbol('LLM_TIMING');

export const defaultTiming: LlmClientTiming = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
};

/** Exponential backoff with equal jitter: half fixed, half random. */
export function backoffDelay(attempt: number, baseMs: number, random: number): number {
  const exponential = baseMs * 2 ** (attempt - 1);
  return Math.round(exponential / 2 + (exponential / 2) * random);
}

/**
 * Resilience around the raw provider, shared by every use case:
 *  - 429 and 5xx (overloaded) → exponential backoff with jitter, up to `LLM_MAX_ATTEMPTS`;
 *  - schema validation failure → exactly one retry on the retry model, telling
 *    the model what was wrong; a second failure surfaces as a typed `LlmError`.
 */
@Injectable()
export class LlmClient implements OnApplicationBootstrap {
  private readonly logger = new Logger(LlmClient.name);
  /** Result of the boot-time model check (empty when the provider has no catalogue). */
  modelReport: ModelResolutionReport = { available: [], warnings: [] };

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LLM_TIMING) private readonly timing: LlmClientTiming,
  ) {}

  /** Validates the configured models against the vendor's list. Never blocks or fails the boot. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.BACKGROUND_JOBS_ENABLED) return;
    if (!this.provider.resolveModels || !this.provider.isConfigured()) return;
    try {
      this.modelReport = await this.provider.resolveModels();
    } catch {
      this.modelReport = { available: [], warnings: ['Falha ao validar os modelos da IA.'] };
    }
    for (const warning of this.modelReport.warnings) this.logger.warn(warning);
    this.logger.log(
      `AI models: default=${this.provider.modelFor('default')} retry=${this.provider.modelFor('retry')} (${this.modelReport.available.length} available)`,
    );
  }

  get providerName(): string {
    return this.provider.name;
  }

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  modelFor(tier: ModelTier): string {
    return this.provider.modelFor(tier);
  }

  async generateStructured<T>(input: StructuredInput<T>): Promise<T> {
    try {
      return await this.withBackoff(input);
    } catch (error) {
      if (!isLlmError(error) || error.kind !== 'VALIDATION' || input.tier === 'retry') throw error;
      this.logger.warn(
        `${input.name}: invalid structured output, retrying once on ${this.provider.modelFor('retry')}`,
      );
      return this.withBackoff({
        ...input,
        tier: 'retry',
        prompt: `${input.prompt}\n\n${validationFeedback(error.issues)}`,
      });
    }
  }

  private async withBackoff<T>(input: StructuredInput<T>): Promise<T> {
    const maxAttempts = this.config.LLM_MAX_ATTEMPTS;
    for (let attempt = 1; ; attempt += 1) {
      const startedAt = Date.now();
      try {
        let usage: TokenUsage | undefined;
        const result = await this.provider.generateStructured({
          ...input,
          onUsage: (reported) => {
            usage = reported;
            input.onUsage?.(reported);
          },
        });
        // Only counts and timing are logged, never prompt or user content.
        const tokens = usage ? `, in=${usage.inputTokens} out=${usage.outputTokens} tokens` : '';
        this.logger.log(
          `${input.name}: ok (${this.provider.name}/${this.provider.modelFor(input.tier ?? 'default')}, attempt ${attempt}, ${Date.now() - startedAt}ms${tokens})`,
        );
        return result;
      } catch (error) {
        const llmError = isLlmError(error) ? error : new LlmError('PROVIDER', 'LLM request failed');
        const retryable = llmError.kind === 'RATE_LIMIT' || llmError.kind === 'OVERLOADED';
        if (!retryable || attempt >= maxAttempts) {
          this.logger.warn(
            `${input.name}: ${llmError.kind} after ${attempt} attempt(s) — ${llmError.message}`,
          );
          throw llmError;
        }
        const delay = backoffDelay(attempt, this.config.LLM_BACKOFF_BASE_MS, this.timing.random());
        this.logger.warn(
          `${input.name}: ${llmError.kind}, attempt ${attempt}/${maxAttempts}, waiting ${delay}ms`,
        );
        await this.timing.sleep(delay);
      }
    }
  }
}

export function validationFeedback(issues: string[]): string {
  return [
    'ATENÇÃO: sua resposta anterior foi rejeitada pela validação. Corrija os problemas abaixo e responda novamente apenas com o JSON:',
    ...issues.slice(0, 20).map((issue) => `- ${issue}`),
  ].join('\n');
}
