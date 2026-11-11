import { NextResponse, type NextRequest } from 'next/server';

/** Session cookies set by the API (names mirror `apps/api/src/auth/cookies.ts`). */
const SESSION_COOKIES = ['routinely_at', 'routinely_rt'];
const PUBLIC_PATHS = ['/login', '/cadastro'];

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/**
 * First line of defence for pages (Next 16 "proxy", the former middleware): no session cookie
 * means no protected page. It only checks that a cookie *exists*; the API is the real authority
 * and answers 401 for a stale one (the client then tries a refresh, and leaves for /login).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (!hasSession && !isPublic(pathname)) {
    const url = new URL('/login', request.url);
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (hasSession && isPublic(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
