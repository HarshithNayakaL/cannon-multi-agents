import { jwtVerify, SignJWT } from 'jose';

import { isOpenDemo, readEnv, type CannonEnv } from '@/lib/env';

export const SESSION_COOKIE = 'cannon_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const ISSUER = 'cannon';

export type Session = {
  email: string;
  /** `owner` when the email is on the allowlist, `guest` in open demo mode. */
  role: 'owner' | 'guest';
  issuedAt: number;
};

export type AuthorizeFailure = 'invalid-email' | 'not-allowed' | 'bad-passcode';

export type AuthorizeResult =
  { ok: true; session: Session } | { ok: false; reason: AuthorizeFailure };

function secretKey(env: CannonEnv): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * Single-user gate.
 *
 * With `CANNON_AUTH_PASSCODE` set, entry requires the passcode and — if an
 * allowlist is configured — an allowlisted email. With no passcode set the
 * deployment is an open demo and every visitor gets a scoped `guest` session.
 */
export function authorize(
  email: string,
  passcode: string | undefined,
  env: CannonEnv = readEnv(),
): AuthorizeResult {
  const normalized = email.trim().toLowerCase();

  if (!isValidEmail(normalized)) return { ok: false, reason: 'invalid-email' };

  if (isOpenDemo(env)) {
    return {
      ok: true,
      session: { email: normalized, role: 'guest', issuedAt: Date.now() },
    };
  }

  if (env.allowedEmails.length > 0 && !env.allowedEmails.includes(normalized)) {
    return { ok: false, reason: 'not-allowed' };
  }

  if (!passcode || !timingSafeEqual(passcode, env.authPasscode!)) {
    return { ok: false, reason: 'bad-passcode' };
  }

  return { ok: true, session: { email: normalized, role: 'owner', issuedAt: Date.now() } };
}

/** Constant-time comparison so a wrong passcode leaks no length information. */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

export async function createSessionToken(
  session: Session,
  env: CannonEnv = readEnv(),
): Promise<{ token: string; maxAge: number }> {
  const token = await new SignJWT({ email: session.email, role: session.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setSubject(session.email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey(env));

  return { token, maxAge: SESSION_TTL_SECONDS };
}

export async function verifySessionToken(
  token: string | undefined,
  env: CannonEnv = readEnv(),
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(env), { issuer: ISSUER });
    const email = typeof payload.sub === 'string' ? payload.sub : null;
    const role = payload.role === 'owner' || payload.role === 'guest' ? payload.role : null;
    if (!email || !role) return null;
    return { email, role, issuedAt: (payload.iat ?? 0) * 1000 };
  } catch {
    return null;
  }
}

/**
 * Derived from the request rather than from NODE_ENV: behind Vercel's proxy
 * the internal request is plain http, and on a local production build there
 * is no TLS at all. Trusting the forwarded protocol gets both right.
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto');
  if (forwarded) return forwarded.split(',')[0].trim() === 'https';
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function sessionCookieOptions(maxAge: number, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge,
  };
}
