import { estimateTaskOutputSchema } from '@routinely/shared';
import type { AppConfig } from '../config/config.module';
import { FakeLlmProvider } from '../testing/fake-llm-provider';
import { LlmClient, backoffDelay } from './llm-client';
import { LlmError } from './llm-provider';

const valid = { complexity: 3, estimatedMinutes: 60, splittable: true, rationale: 'ok' };
const input = { name: 'estimateTask', system: 's', prompt: 'p', schema: estimateTaskOutputSchema };
const rateLimit = () => new LlmError('RATE_LIMIT', '429');

function setup(config: Partial<AppConfig> = {}) {
  const provider = new FakeLlmProvider();
  const sleep = jest.fn().mockResolvedValue(undefined);
  const client = new LlmClient(
    provider,
    { LLM_MAX_ATTEMPTS: 3, LLM_BACKOFF_BASE_MS: 1000, ...config } as AppConfig,
    { sleep, random: () => 0.5 },
  );
  return { provider, sleep, client };
}

describe('backoffDelay', () => {
  it('grows exponentially with jitter between 50% and 100%', () => {
    expect(backoffDelay(1, 1000, 0)).toBe(500);
    expect(backoffDelay(1, 1000, 1)).toBe(1000);
    expect(backoffDelay(2, 1000, 0.5)).toBe(1500);
    expect(backoffDelay(3, 1000, 1)).toBe(4000);
  });
});

describe('LlmClient', () => {
  it('returns the first valid answer', async () => {
    const { client, provider, sleep } = setup();
    provider.reply(valid);
    await expect(client.generateStructured(input)).resolves.toEqual(valid);
    expect(provider.calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('backs off and retries on 429', async () => {
    const { client, provider, sleep } = setup();
    provider.reply(rateLimit(), rateLimit(), valid);
    await expect(client.generateStructured(input)).resolves.toEqual(valid);
    expect(provider.calls).toHaveLength(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([750, 1500]);
  });

  it('also backs off when the provider is overloaded (5xx)', async () => {
    const { client, provider, sleep } = setup();
    provider.reply(new LlmError('OVERLOADED', '503'), valid);
    await expect(client.generateStructured(input)).resolves.toEqual(valid);
    expect(provider.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up after the maximum number of attempts', async () => {
    const { client, provider, sleep } = setup();
    provider.reply(rateLimit(), rateLimit(), rateLimit(), valid);
    await expect(client.generateStructured(input)).rejects.toMatchObject({ kind: 'RATE_LIMIT' });
    expect(provider.calls).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it.each(['TIMEOUT', 'UNAVAILABLE', 'PROVIDER'] as const)(
    'does not retry %s errors',
    async (kind) => {
      const { client, provider } = setup();
      provider.reply(new LlmError(kind, 'boom'), valid);
      await expect(client.generateStructured(input)).rejects.toMatchObject({ kind });
      expect(provider.calls).toHaveLength(1);
    },
  );

  it('retries a validation failure once on the retry model, with the issues', async () => {
    const { client, provider } = setup();
    provider.reply({ ...valid, complexity: 99 }, valid);
    await expect(client.generateStructured(input)).resolves.toEqual(valid);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[0]?.tier).toBeUndefined();
    expect(provider.calls[1]?.tier).toBe('retry');
    expect(provider.calls[1]?.prompt).toContain('rejeitada pela validação');
    expect(provider.calls[1]?.prompt).toContain('complexity');
  });

  it('throws a typed error when the retry is also invalid', async () => {
    const { client, provider } = setup();
    provider.reply({ ...valid, complexity: 99 }, { ...valid, estimatedMinutes: -1 }, valid);
    await expect(client.generateStructured(input)).rejects.toMatchObject({ kind: 'VALIDATION' });
    expect(provider.calls).toHaveLength(2);
  });

  it('does not retry validation again when already on the retry tier', async () => {
    const { client, provider } = setup();
    provider.reply({ ...valid, complexity: 99 }, valid);
    await expect(client.generateStructured({ ...input, tier: 'retry' })).rejects.toMatchObject({
      kind: 'VALIDATION',
    });
    expect(provider.calls).toHaveLength(1);
  });

  it('wraps unexpected provider exceptions', async () => {
    const { client, provider } = setup();
    provider.reply(() => {
      throw new Error('secret=abc');
    });
    const error = await client.generateStructured(input).catch((e) => e);
    expect(error).toMatchObject({ kind: 'PROVIDER' });
    expect(error.message).not.toContain('abc');
  });

  it('exposes provider metadata', () => {
    const { client, provider } = setup();
    expect(client.providerName).toBe('fake');
    expect(client.modelFor('retry')).toBe('fake-retry');
    provider.configured = false;
    expect(client.isConfigured()).toBe(false);
  });

  it('logs token counts but never the prompt content', async () => {
    const { client, provider } = setup();
    const logger = jest.spyOn(client['logger'], 'log').mockImplementation(() => undefined);
    const generate = jest.spyOn(provider, 'generateStructured').mockImplementation(async (call) => {
      call.onUsage?.({ inputTokens: 1200, outputTokens: 340 });
      return valid as never;
    });
    const onUsage = jest.fn();
    await client.generateStructured({ ...input, prompt: 'SEGREDO do usuário', onUsage });
    expect(generate).toHaveBeenCalled();
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 1200, outputTokens: 340 });
    const message = String(logger.mock.calls[0]?.[0]);
    expect(message).toContain('in=1200 out=340 tokens');
    expect(message).not.toContain('SEGREDO');
  });

  describe('boot-time model check', () => {
    it('stores the provider report and warns about replaced models', async () => {
      const { client, provider } = setup();
      const resolveModels = jest
        .fn()
        .mockResolvedValue({ available: ['gemini-3.8-flash'], warnings: ['GEMINI_MODEL trocado'] });
      Object.assign(provider, { resolveModels });
      const warn = jest.spyOn(client['logger'], 'warn').mockImplementation(() => undefined);
      jest.spyOn(client['logger'], 'log').mockImplementation(() => undefined);
      await client.onApplicationBootstrap();
      expect(client.modelReport.warnings).toEqual(['GEMINI_MODEL trocado']);
      expect(warn).toHaveBeenCalledWith('GEMINI_MODEL trocado');
    });

    it('never fails the boot when listing models throws, and skips providers without a catalogue', async () => {
      const { client, provider } = setup();
      jest.spyOn(client['logger'], 'warn').mockImplementation(() => undefined);
      jest.spyOn(client['logger'], 'log').mockImplementation(() => undefined);
      await client.onApplicationBootstrap();
      expect(client.modelReport.warnings).toEqual([]);
      Object.assign(provider, { resolveModels: jest.fn().mockRejectedValue(new Error('boom')) });
      await expect(client.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(client.modelReport.warnings).toEqual(['Falha ao validar os modelos da IA.']);
    });
  });
});
