/** Points the app at the dedicated e2e database. Loaded before every test file. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://routinely:routinely@localhost:5432/routinely_test?schema=public';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DATABASE_URL;
// Never call a real LLM from tests.
process.env.GEMINI_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';
process.env.LLM_BACKOFF_BASE_MS = '0';
process.env.AI_RATE_LIMIT_MAX = '1000';
