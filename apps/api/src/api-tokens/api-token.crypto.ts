import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { API_TOKEN_PREFIX } from '@routinely/shared';

/** Characters after `rtly_` kept in clear to tell tokens apart. */
export const PREFIX_LENGTH = 8;

export interface GeneratedToken {
  token: string;
  prefix: string;
  tokenHash: string;
}

export const hashApiToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** `rtly_` + 32 random bytes (base64url). Only the hash is ever stored. */
export function generateApiToken(): GeneratedToken {
  const secret = randomBytes(32).toString('base64url');
  const token = `${API_TOKEN_PREFIX}${secret}`;
  return { token, prefix: secret.slice(0, PREFIX_LENGTH), tokenHash: hashApiToken(token) };
}

/** Constant-time comparison of two hex digests of the same algorithm. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
