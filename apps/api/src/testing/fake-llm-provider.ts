import {
  LlmError,
  type LlmProvider,
  type ModelTier,
  type StructuredInput,
} from '../ai/llm-provider';
import { parseStructured } from '../ai/parse-structured';

type Reply = unknown | LlmError | ((input: StructuredInput<unknown>) => unknown);

/**
 * Scripted provider for tests: each call consumes the next reply. A reply may be a
 * value (validated like a real answer), an `LlmError` to throw, or a function.
 */
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';
  readonly calls: StructuredInput<unknown>[] = [];
  configured = true;
  private replies: Reply[] = [];

  reply(...replies: Reply[]): this {
    this.replies.push(...replies);
    return this;
  }

  clear(): void {
    this.replies = [];
  }

  isConfigured(): boolean {
    return this.configured;
  }

  modelFor(tier: ModelTier): string {
    return tier === 'retry' ? 'fake-retry' : 'fake-default';
  }

  async generateStructured<T>(input: StructuredInput<T>): Promise<T> {
    this.calls.push(input as StructuredInput<unknown>);
    if (!this.configured) throw new LlmError('UNAVAILABLE', 'not configured');
    if (this.replies.length === 0)
      throw new LlmError('PROVIDER', 'FakeLlmProvider has no reply left');
    const next = this.replies.shift();
    const value =
      typeof next === 'function'
        ? await (next as (i: StructuredInput<unknown>) => unknown)(
            input as StructuredInput<unknown>,
          )
        : next;
    if (value instanceof LlmError) throw value;
    return parseStructured(JSON.stringify(value), input.schema);
  }
}
