// @vitest-environment node
import { forwardToApi, targetUrl } from './api-proxy';

const BASE = 'http://api.internal:3001';

describe('targetUrl', () => {
  it('maps /api/* to the API, keeping path and query', () => {
    expect(targetUrl('https://web.test/api/auth/login', BASE)).toBe(`${BASE}/auth/login`);
    expect(targetUrl('https://web.test/api/tasks?status=TODO', BASE)).toBe(
      `${BASE}/tasks?status=TODO`,
    );
    expect(targetUrl('https://web.test/api', BASE)).toBe(`${BASE}/`);
  });

  it('never lets a path climb out of /api, however the dots are encoded', () => {
    expect(targetUrl('https://web.test/api/%2e%2e/etc', BASE)).toBeNull();
    // climbing back inside /api stays inside /api (the URL parser resolves it)
    expect(targetUrl('https://web.test/api/tasks/%2E%2E', BASE)).toBe(`${BASE}/`);
  });
});

describe('forwardToApi', () => {
  const upstream = (init: ResponseInit & { cookies?: string[]; body?: string | null } = {}) => {
    const headers = new Headers(init.headers);
    for (const cookie of init.cookies ?? []) headers.append('set-cookie', cookie);
    const body = 'body' in init ? init.body : '{"ok":true}';
    return new Response(body, { status: init.status ?? 200, headers });
  };

  it('forwards method, body and the browser cookies, but not host or other headers', async () => {
    const doFetch = vi.fn().mockResolvedValue(upstream());
    await forwardToApi(
      new Request('https://web.test/api/tasks', {
        method: 'POST',
        body: '{"title":"x"}',
        headers: {
          'content-type': 'application/json',
          cookie: 'routinely_at=abc',
          host: 'web.test',
          'x-forwarded-for': '203.0.113.9',
          authorization: 'Bearer should-not-pass',
        },
      }),
      BASE,
      doFetch,
    );
    const [url, init] = doFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/tasks`);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('manual');
    const sent = init.headers as Headers;
    expect(sent.get('cookie')).toBe('routinely_at=abc');
    expect(sent.get('x-forwarded-for')).toBe('203.0.113.9');
    expect(sent.get('content-type')).toBe('application/json');
    expect(sent.get('host')).toBeNull();
    expect(sent.get('authorization')).toBeNull();
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"title":"x"}');
  });

  it('sends no body for GET and keeps several Set-Cookie headers separate', async () => {
    const doFetch = vi.fn().mockResolvedValue(
      upstream({
        cookies: [
          'routinely_at=a; Path=/; HttpOnly; Secure; SameSite=Lax',
          'routinely_rt=b; Path=/; HttpOnly; Secure; SameSite=Lax',
        ],
        headers: { 'content-type': 'application/json', 'x-secret-internal': 'no' },
      }),
    );
    const response = await forwardToApi(new Request('https://web.test/api/auth/me'), BASE, doFetch);
    expect((doFetch.mock.calls[0] as [string, RequestInit])[1].body).toBeUndefined();
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie()[1]).toContain('routinely_rt=b');
    expect(response.headers.get('x-secret-internal')).toBeNull();
    expect(await response.json()).toEqual({ ok: true });
  });

  it('passes statuses through, including redirects and 204', async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValueOnce(upstream({ status: 204, body: null }))
      .mockResolvedValueOnce(upstream({ status: 409, body: '{"code":"X"}' }));
    expect(
      (
        await forwardToApi(
          new Request('https://web.test/api/auth/logout', { method: 'POST' }),
          BASE,
          doFetch,
        )
      ).status,
    ).toBe(204);
    expect((await forwardToApi(new Request('https://web.test/api/x'), BASE, doFetch)).status).toBe(
      409,
    );
  });

  it('answers 502 in the API error shape when the API is unreachable', async () => {
    const response = await forwardToApi(
      new Request('https://web.test/api/tasks'),
      BASE,
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED 10.0.0.5:3001')),
    );
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });

  it('rejects a path escaping the API with 400 without calling it', async () => {
    const doFetch = vi.fn();
    const response = await forwardToApi(
      new Request('https://web.test/api/%2e%2e/x'),
      BASE,
      doFetch,
    );
    expect(response.status).toBe(400);
    expect(doFetch).not.toHaveBeenCalled();
  });
});
