/**
 * Same-origin proxy to the API (`/api/*` → `API_INTERNAL_URL`).
 *
 * Why: in production the web app and the API live on different domains. The session cookies are
 * set by the API, so the browser would treat them as third-party and drop them. Going through
 * this proxy keeps them first-party (the browser only ever talks to the web origin), needs no
 * CORS and no `SameSite=None`. The target is read at request time, so one image serves any
 * environment.
 */

/** Request headers worth forwarding. Everything else (host, connection, …) is hop-specific. */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'accept-language', 'cookie'];
/** Response headers worth returning (`set-cookie` is handled separately: it may repeat). */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'retry-after'];

const UNSAFE_SEGMENT = /^\.\.?$/;

export function apiBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.API_INTERNAL_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}

/** Maps `/api/auth/login?x=1` to `<api>/auth/login?x=1`; `null` for paths that must not pass. */
export function targetUrl(requestUrl: string, base: string): string | null {
  const url = new URL(requestUrl);
  // `new URL` resolves dot segments (even %2e%2e): anything that climbed out of /api is refused.
  if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return null;
  const rest = url.pathname.replace(/^\/api(?=\/|$)/, '');
  if (rest.split('/').some((segment) => UNSAFE_SEGMENT.test(decodeURIComponent(segment)))) {
    return null;
  }
  return `${base}${rest || '/'}${url.search}`;
}

export async function forwardToApi(
  request: Request,
  base: string = apiBaseUrl(),
  doFetch: typeof fetch = fetch,
): Promise<Response> {
  const target = targetUrl(request.url, base);
  if (!target) return Response.json({ message: 'Caminho inválido.' }, { status: 400 });

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The API rate limits per client IP: tell it who the browser is (`TRUST_PROXY=1` there).
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) headers.set('x-forwarded-for', forwardedFor);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await doFetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      // Never follow redirects on behalf of the browser: hand them back as they are.
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json(
      {
        statusCode: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Não foi possível conectar ao servidor. Tente novamente em instantes.',
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  // Several cookies arrive as several headers: they must stay separate.
  for (const cookie of upstream.headers.getSetCookie())
    responseHeaders.append('set-cookie', cookie);
  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
