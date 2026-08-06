import { describe, expect, it } from 'vitest';

import {
  authorize,
  createSessionToken,
  isValidEmail,
  timingSafeEqual,
  verifySessionToken,
} from '@/lib/auth/session';
import { readEnv } from '@/lib/env';

const OPEN = readEnv({ CANNON_AUTH_SECRET: 'test-secret-value' });
const GATED = readEnv({
  CANNON_AUTH_SECRET: 'test-secret-value',
  CANNON_AUTH_PASSCODE: 'open-sesame',
  CANNON_ALLOWED_EMAILS: 'owner@example.com',
});

describe('authorize', () => {
  it('rejects anything that is not an email before touching the passcode', () => {
    expect(authorize('not-an-email', 'open-sesame', GATED)).toEqual({
      ok: false,
      reason: 'invalid-email',
    });
  });

  it('issues a guest session in open demo mode without a passcode', () => {
    const result = authorize('anyone@example.com', undefined, OPEN);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.role).toBe('guest');
  });

  it('rejects emails outside the allowlist', () => {
    expect(authorize('stranger@example.com', 'open-sesame', GATED)).toEqual({
      ok: false,
      reason: 'not-allowed',
    });
  });

  it('rejects an allowlisted email with the wrong passcode', () => {
    expect(authorize('owner@example.com', 'wrong', GATED)).toEqual({
      ok: false,
      reason: 'bad-passcode',
    });
  });

  it('rejects an allowlisted email with no passcode at all', () => {
    expect(authorize('owner@example.com', undefined, GATED)).toEqual({
      ok: false,
      reason: 'bad-passcode',
    });
  });

  it('grants owner role on a full match and normalises the email', () => {
    const result = authorize('  Owner@Example.com ', 'open-sesame', GATED);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session).toMatchObject({ email: 'owner@example.com', role: 'owner' });
    }
  });
});

describe('session tokens', () => {
  it('round-trips a signed session', async () => {
    const session = { email: 'owner@example.com', role: 'owner' as const, issuedAt: Date.now() };
    const { token, maxAge } = await createSessionToken(session, GATED);
    expect(maxAge).toBeGreaterThan(0);

    const verified = await verifySessionToken(token, GATED);
    expect(verified).toMatchObject({ email: 'owner@example.com', role: 'owner' });
  });

  it('refuses a token signed with a different secret', async () => {
    const { token } = await createSessionToken(
      { email: 'owner@example.com', role: 'owner', issuedAt: Date.now() },
      GATED,
    );
    const other = readEnv({ CANNON_AUTH_SECRET: 'a-completely-different-secret' });
    expect(await verifySessionToken(token, other)).toBeNull();
  });

  it('refuses garbage and missing tokens', async () => {
    expect(await verifySessionToken(undefined, GATED)).toBeNull();
    expect(await verifySessionToken('not.a.jwt', GATED)).toBeNull();
  });
});

describe('primitives', () => {
  it('validates email shape', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.co')).toBe(false);
  });

  it('compares strings without leaking length through early exit', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcdef')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });
});
