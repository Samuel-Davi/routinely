import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiToken as ApiTokenRow } from '@prisma/client';
import type { Clock } from '../common/clock';
import { requestContext } from '../common/request-context';
import { generateApiToken, hashApiToken, sameHash } from './api-token.crypto';
import { API_TOKEN_RATE_LIMIT, ApiTokenAuth, ApiTokenGuard } from './api-token.guard';
import type { ApiTokensRepository } from './api-tokens.repository';
import { ApiTokensService } from './api-tokens.service';

const OWNER = '00000000-0000-4000-8000-000000000001';
const COOKIE_USER = '00000000-0000-4000-8000-000000000002';

class Handlers {
  @ApiTokenAuth('read:today')
  today(): void {}

  // A route without the decorator: the guard must refuse, never default to "allowed".
  plain(): void {}
}

function setup() {
  const rows: ApiTokenRow[] = [];
  const touch = jest.fn().mockResolvedValue(undefined);
  const repository = {
    findByHash: jest.fn(async (hash: string) => rows.find((row) => row.tokenHash === hash) ?? null),
    touch,
  };
  const clock = { now: () => new Date('2026-11-24T12:00:00Z') } as Clock;
  const service = new ApiTokensService(repository as unknown as ApiTokensRepository, clock);
  const guard = new ApiTokenGuard(new Reflector(), service);

  function addToken(overrides: Partial<ApiTokenRow> = {}): string {
    const { token, prefix, tokenHash } = generateApiToken();
    rows.push({
      id: `token-${rows.length + 1}`,
      userId: OWNER,
      label: 'jarvis',
      prefix,
      tokenHash,
      scopes: ['read:today'],
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
      ...overrides,
    });
    return token;
  }

  /** Runs the guard as a request with these headers, starting from `sessionUser` (a cookie). */
  async function run(
    headers: Record<string, string>,
    { handler = 'today', sessionUser }: { handler?: keyof Handlers; sessionUser?: string } = {},
  ): Promise<{ allowed: boolean; userId?: string; error?: unknown }> {
    const context = {
      getHandler: () => Handlers.prototype[handler],
      getClass: () => Handlers,
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
    const store: { userId?: string } = { userId: sessionUser };
    return requestContext.run(store, async () => {
      try {
        return { allowed: await guard.canActivate(context), userId: store.userId };
      } catch (error) {
        return { allowed: false, userId: store.userId, error };
      }
    });
  }

  return { addToken, run, touch };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const expect401 = (result: { allowed: boolean; userId?: string; error?: unknown }) => {
  expect(result.allowed).toBe(false);
  expect(result.userId).toBeUndefined();
  expect(result.error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
};

describe('ApiTokenGuard', () => {
  it('accepts a valid token and runs the request as its owner', async () => {
    const { addToken, run, touch } = setup();
    const result = await run(bearer(addToken()));
    expect(result).toEqual({ allowed: true, userId: OWNER });
    expect(touch).toHaveBeenCalledTimes(1);
  });

  it('uses the token owner even when a session cookie of someone else came along', async () => {
    const { addToken, run } = setup();
    expect(await run(bearer(addToken()), { sessionUser: COOKIE_USER })).toEqual({
      allowed: true,
      userId: OWNER,
    });
  });

  it('refuses a revoked token', async () => {
    const { addToken, run } = setup();
    expect401(await run(bearer(addToken({ revokedAt: new Date() }))));
  });

  it('refuses an unknown token', async () => {
    const { run } = setup();
    expect401(await run(bearer(generateApiToken().token)));
  });

  it('refuses a token without the route scope', async () => {
    const { addToken, run } = setup();
    expect401(await run(bearer(addToken({ scopes: ['read:other'] }))));
  });

  it('refuses a request without the Authorization header', async () => {
    const { run } = setup();
    expect401(await run({}));
  });

  it('refuses the session cookie alone, and clears the user it had set', async () => {
    const { run } = setup();
    expect401(await run({ cookie: 'routinely_at=session' }, { sessionUser: COOKIE_USER }));
  });

  it('refuses a session JWT sent as Bearer (not a personal token)', async () => {
    const { run } = setup();
    expect401(await run(bearer('eyJhbGciOiJIUzI1NiJ9.e30.sig'), { sessionUser: COOKIE_USER }));
  });

  it('refuses a malformed header', async () => {
    const { addToken, run } = setup();
    expect401(await run({ authorization: `Basic ${addToken()}` }));
  });

  it('refuses a route that was not marked with a scope', async () => {
    const { addToken, run } = setup();
    expect401(await run(bearer(addToken()), { handler: 'plain' }));
  });

  it(`limits each token to ${API_TOKEN_RATE_LIMIT} calls per minute`, async () => {
    const { addToken, run } = setup();
    const token = addToken();
    for (let call = 0; call < API_TOKEN_RATE_LIMIT; call += 1) {
      expect((await run(bearer(token))).allowed).toBe(true);
    }
    const limited = await run(bearer(token));
    expect(limited.error).toMatchObject({ status: 429 });
    expect(limited.userId).toBeUndefined();
    // Another token keeps its own budget.
    expect((await run(bearer(addToken()))).allowed).toBe(true);
  });

  it('does not rewrite lastUsedAt on every call', async () => {
    const { addToken, run, touch } = setup();
    const token = addToken({ lastUsedAt: new Date('2026-11-24T11:59:30Z') });
    await run(bearer(token));
    expect(touch).not.toHaveBeenCalled();
  });
});

describe('api token crypto', () => {
  it('generates rtly_ + 32 random bytes and stores only a SHA-256 hash', () => {
    const { token, prefix, tokenHash } = generateApiToken();
    expect(token).toMatch(/^rtly_[A-Za-z0-9_-]{43}$/);
    expect(token.slice(5, 13)).toBe(prefix);
    expect(tokenHash).toBe(hashApiToken(token));
    expect(tokenHash).not.toContain(token.slice(5));
  });

  it('compares hashes of the same length only', () => {
    const hash = hashApiToken('a');
    expect(sameHash(hash, hash)).toBe(true);
    expect(sameHash(hash, hashApiToken('b'))).toBe(false);
    expect(sameHash(hash, 'abcd')).toBe(false);
  });
});
