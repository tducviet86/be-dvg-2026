import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../config/config.service.js';

export const ACCESS_COOKIE = 'dvg_at';
export const REFRESH_COOKIE = 'dvg_rt';
export const CSRF_COOKIE = 'dvg_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const REFRESH_PATH = '/api/v1/auth';

function base(config: AppConfig): CookieOptions {
  return {
    secure: config.get('COOKIE_SECURE'),
    sameSite: 'strict',
    domain: config.get('COOKIE_DOMAIN') || undefined,
  };
}

export function setAuthCookies(
  res: Response,
  config: AppConfig,
  tokens: { access: string; refresh: string; csrf: string; refreshExpires: Date },
) {
  const common = base(config);
  res.cookie(ACCESS_COOKIE, tokens.access, {
    ...common,
    httpOnly: true,
    path: '/',
    maxAge: config.get('ACCESS_TOKEN_TTL_SECONDS') * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refresh, {
    ...common,
    httpOnly: true,
    path: REFRESH_PATH,
    expires: tokens.refreshExpires,
  });
  // Readable by the admin UI so it can echo it in the CSRF header.
  res.cookie(CSRF_COOKIE, tokens.csrf, {
    ...common,
    httpOnly: false,
    path: '/',
    expires: tokens.refreshExpires,
  });
}

export function clearAuthCookies(res: Response, config: AppConfig) {
  const common = base(config);
  res.clearCookie(ACCESS_COOKIE, { ...common, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...common, path: REFRESH_PATH });
  res.clearCookie(CSRF_COOKIE, { ...common, path: '/' });
}
