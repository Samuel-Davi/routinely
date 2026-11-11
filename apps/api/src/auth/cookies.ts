import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../config/config.module';

export const ACCESS_COOKIE = 'routinely_at';
export const REFRESH_COOKIE = 'routinely_rt';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

function baseOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    // Lax: sent on top-level navigations, never on cross-site POSTs (CSRF defence).
    sameSite: 'lax',
    // "/" on purpose: behind the web proxy the browser sees /api/auth/*, not /auth/*.
    path: '/',
  };
}

export function setAuthCookies(res: Response, tokens: SessionTokens, config: AppConfig): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(config),
    maxAge: config.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(config),
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response, config: AppConfig): void {
  res.clearCookie(ACCESS_COOKIE, baseOptions(config));
  res.clearCookie(REFRESH_COOKIE, baseOptions(config));
}
