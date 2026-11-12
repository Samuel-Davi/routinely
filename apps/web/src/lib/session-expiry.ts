/**
 * What to do when a request is still 401 after a refresh: the session is over. Leaving for /login
 * naively can loop forever when a stale cookie survives: the page guard (`proxy.ts`) sees the
 * cookie and bounces /login back to /, which fails again. So we (1) ask the server to clear the
 * cookies first and (2) never redirect twice within a short window.
 */
export const REDIRECT_GUARD_KEY = 'routinely:login-redirect-at';
export const REDIRECT_GUARD_MS = 10_000;

interface Deps {
  /** POST /auth/logout through the same-origin proxy (clears the cookies). */
  logout: () => Promise<unknown>;
  navigate: (path: string) => void;
  now: () => number;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  pathname: string;
}

/** Returns true when it navigated, false when it deliberately did not (already on /login or a loop). */
export async function leaveForLogin({
  logout,
  navigate,
  now,
  storage,
  pathname,
}: Deps): Promise<boolean> {
  if (pathname.startsWith('/login')) return false;
  try {
    const last = Number(storage?.getItem(REDIRECT_GUARD_KEY) ?? 0);
    if (now() - last < REDIRECT_GUARD_MS) return false; // we just did this: stop, do not loop
    storage?.setItem(REDIRECT_GUARD_KEY, String(now()));
  } catch {
    // storage blocked (private mode): fall through, the logout below still breaks the usual loop
  }
  await Promise.race([
    logout().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  navigate('/login');
  return true;
}
