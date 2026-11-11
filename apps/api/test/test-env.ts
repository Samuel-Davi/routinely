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
// Most e2e tests script `times` proposals; the order strategies have their own spec.
process.env.AI_PLANNING_STRATEGY = 'times';
process.env.AI_RATE_LIMIT_MAX = '1000';
// Auth: a fixed test secret; Bearer tokens are used, so cookies need not be Secure over http.
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.COOKIE_SECURE = 'false';
process.env.AI_DAILY_LIMIT = '1000';
