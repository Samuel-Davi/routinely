import { estimateTaskOutputSchema } from '@routinely/shared';
import { loadEnv } from '../../config/env';
import { createLlmProvider } from './create-provider';

const base = { DATABASE_URL: 'postgresql://localhost/db' };
const input = { name: 'x', system: 's', prompt: 'p', schema: estimateTaskOutputSchema };

describe('createLlmProvider', () => {
  it('defaults to Gemini with the configured models', () => {
    const provider = createLlmProvider(loadEnv({ ...base, GEMINI_API_KEY: 'k' }));
    expect(provider.name).toBe('gemini');
    expect(provider.isConfigured()).toBe(true);
    expect(provider.modelFor('default')).toBe('gemini-3.5-flash-lite');
    expect(provider.modelFor('retry')).toBe('gemini-3.6-flash');
  });

  it.each([
    ['anthropic', 'claude-haiku-5-5'],
    ['ollama', 'llama3.1'],
  ])('selects the %s stub, which is always unavailable', async (name, model) => {
    const provider = createLlmProvider(
      loadEnv({ ...base, LLM_PROVIDER: name, ANTHROPIC_API_KEY: 'k' }),
    );
    expect(provider.name).toBe(name);
    expect(provider.modelFor('default')).toBe(model);
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.generateStructured(input)).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });
});
