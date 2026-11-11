import { EnvValidationError, SEED_USER_ID, loadEnv } from './env';

const base = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db' };

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      PORT: 3001,
      LLM_PROVIDER: 'gemini',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
      GEMINI_RETRY_MODEL: 'gemini-3.6-flash',
      DEFAULT_USER_ID: SEED_USER_ID,
      DEFAULT_TIMEZONE: 'America/Manaus',
      CORS_ORIGINS: ['http://localhost:3000'],
      LLM_MAX_ATTEMPTS: 3,
      AI_PLANNING_STRATEGY: 'order-day',
    });
    expect(env.GEMINI_API_KEY).toBeUndefined();
  });

  it('parses lists, numbers and treats blank secrets as missing', () => {
    const env = loadEnv({
      ...base,
      PORT: '4000',
      CORS_ORIGINS: 'http://a.test, http://b.test',
      GEMINI_API_KEY: '   ',
      ANTHROPIC_API_KEY: ' key ',
    });
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBe('key');
  });

  it('fails with a readable message and without leaking values', () => {
    expect(() => loadEnv({ LLM_PROVIDER: 'openai', GEMINI_API_KEY: 'super-secret' })).toThrow(
      EnvValidationError,
    );
    try {
      loadEnv({ LLM_PROVIDER: 'openai', GEMINI_API_KEY: 'super-secret' });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('LLM_PROVIDER');
      expect(message).not.toContain('super-secret');
    }
  });
});
