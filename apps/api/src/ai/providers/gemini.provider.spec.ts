import { ApiError } from '@google/genai';
import { estimateTaskOutputSchema } from '@routinely/shared';
import { LlmError } from '../llm-provider';
import { GeminiProvider, toLlmError, type GeminiClient } from './gemini.provider';

const options = {
  apiKey: 'test-key-123',
  model: 'gemini-default',
  retryModel: 'gemini-retry',
  timeoutMs: 5000,
  maxOutputTokens: 1024,
};
const valid = { complexity: 2, estimatedMinutes: 45, splittable: false, rationale: 'Simples.' };
const input = {
  name: 'estimateTask',
  system: 'system',
  prompt: 'prompt',
  schema: estimateTaskOutputSchema,
};

function fakeClient(
  result:
    | {
        text?: string;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      }
    | Error,
) {
  const generateContent = jest.fn(async (_params: unknown) => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { models: { generateContent } } as unknown as GeminiClient, generateContent };
}

const apiError = (status: number) => new ApiError({ status, message: `key=test-key-123 failed` });

describe('GeminiProvider', () => {
  it('reports the token usage the API returned', async () => {
    const { client } = fakeClient({
      text: JSON.stringify(valid),
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 },
    });
    const onUsage = jest.fn();
    await new GeminiProvider(options, client).generateStructured({ ...input, onUsage });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 900, outputTokens: 120 });
  });

  it('replaces configured models that do not exist with the newest existing ones', async () => {
    async function* list() {
      yield { name: 'models/gemini-3.5-flash-lite', supportedActions: ['generateContent'] };
      yield { name: 'models/gemini-3.8-flash', supportedActions: ['generateContent'] };
      yield { name: 'models/text-embedding', supportedActions: ['embedContent'] };
    }
    const client = { models: { list: async () => list(), generateContent: jest.fn() } };
    const provider = new GeminiProvider(
      { ...options, model: 'gemini-9-flash-lite', retryModel: 'gemini-3.6-flash' },
      client as unknown as GeminiClient,
    );
    const report = await provider.resolveModels();
    expect(report.available).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
    expect(provider.modelFor('default')).toBe('gemini-3.5-flash-lite');
    expect(provider.modelFor('retry')).toBe('gemini-3.8-flash');
    expect(report.warnings).toHaveLength(2);
    expect(JSON.stringify(report)).not.toContain('test-key-123');
  });

  it('does not list models without a key, and survives a failing list call', async () => {
    const list = jest.fn();
    const noKey = new GeminiProvider({ ...options, apiKey: undefined }, {
      models: { list },
    } as unknown as GeminiClient);
    await expect(noKey.resolveModels()).resolves.toEqual({ available: [], warnings: [] });
    expect(list).not.toHaveBeenCalled();

    const failing = new GeminiProvider(options, {
      models: { list: async () => Promise.reject(apiError(503)) },
    } as unknown as GeminiClient);
    const report = await failing.resolveModels();
    expect(report.warnings[0]).toContain('Não foi possível listar');
    expect(failing.modelFor('default')).toBe('gemini-default');
  });

  it('requests JSON constrained by the schema and validates the answer', async () => {
    const { client, generateContent } = fakeClient({ text: JSON.stringify(valid) });
    const provider = new GeminiProvider(options, client);

    await expect(provider.generateStructured(input)).resolves.toEqual(valid);

    const request = generateContent.mock.calls[0]?.[0] as unknown as {
      model: string;
      contents: string;
      config: Record<string, unknown>;
    };
    expect(request.model).toBe('gemini-default');
    expect(request.contents).toBe('prompt');
    expect(request.config).toMatchObject({
      systemInstruction: 'system',
      responseMimeType: 'application/json',
      maxOutputTokens: 1024,
      httpOptions: { timeout: 5000, retryOptions: { attempts: 1 } },
    });
    const schema = request.config.responseJsonSchema as {
      type: string;
      properties: object;
      $schema?: string;
    };
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties)).toEqual([
      'complexity',
      'estimatedMinutes',
      'splittable',
      'rationale',
    ]);
    expect(schema.$schema).toBeUndefined();
    expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('uses the retry model for the retry tier', async () => {
    const { client, generateContent } = fakeClient({ text: JSON.stringify(valid) });
    await new GeminiProvider(options, client).generateStructured({ ...input, tier: 'retry' });
    expect((generateContent.mock.calls[0]?.[0] as unknown as { model: string }).model).toBe(
      'gemini-retry',
    );
  });

  it('throws a VALIDATION error for output that does not match the schema', async () => {
    const { client } = fakeClient({ text: JSON.stringify({ ...valid, complexity: 'high' }) });
    await expect(
      new GeminiProvider(options, client).generateStructured(input),
    ).rejects.toMatchObject({
      kind: 'VALIDATION',
    });
  });

  it('is unavailable without an API key and never calls the SDK', async () => {
    const { client, generateContent } = fakeClient({ text: '{}' });
    const provider = new GeminiProvider({ ...options, apiKey: undefined }, client);
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.generateStructured(input)).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([
    [429, 'RATE_LIMIT'],
    [504, 'TIMEOUT'],
    [403, 'UNAVAILABLE'],
    [503, 'OVERLOADED'],
    [500, 'OVERLOADED'],
    [400, 'PROVIDER'],
  ])('maps HTTP %i to %s without leaking the API key', async (status, kind) => {
    const { client } = fakeClient(apiError(status));
    const error = await new GeminiProvider(options, client)
      .generateStructured(input)
      .catch((e) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe(kind);
    expect(error.message).not.toContain('test-key-123');
  });

  it('maps aborts and unknown failures', () => {
    const timeout = new Error('aborted');
    timeout.name = 'TimeoutError';
    expect(toLlmError(timeout).kind).toBe('TIMEOUT');
    expect(toLlmError(new Error('socket hang up')).kind).toBe('PROVIDER');
    expect(toLlmError('weird').kind).toBe('PROVIDER');
    const original = new LlmError('VALIDATION', 'x');
    expect(toLlmError(original)).toBe(original);
  });
});
