import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  authorize,
  createSessionToken,
  isSecureRequest,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/auth/session';
import { getSession } from '@/lib/auth/server';
import { enforceRateLimit } from '@/lib/ratelimit';
import { readEnv } from '@/lib/env';

export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().min(3).max(200),
  passcode: z.string().max(200).optional(),
});

const FAILURE_MESSAGES = {
  'invalid-email': 'That does not look like an email address.',
  'not-allowed': 'That email is not on the allowlist for this deployment.',
  'bad-passcode': 'Incorrect passcode.',
} as const;

export async function GET() {
  const session = await getSession();
  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  // Throttled on the request origin so the passcode cannot be brute-forced.
  const key = `signin:${request.headers.get('x-forwarded-for') ?? 'local'}`;
  const limit = await enforceRateLimit(key);
  if (!limit.success) {
    return NextResponse.json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const result = authorize(parsed.data.email, parsed.data.passcode, readEnv());
  if (!result.ok) {
    return NextResponse.json({ error: FAILURE_MESSAGES[result.reason] }, { status: 401 });
  }

  const { token, maxAge } = await createSessionToken(result.session);
  const response = NextResponse.json({ session: result.session });
  response.cookies.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(maxAge, isSecureRequest(request)),
  );
  return response;
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', sessionCookieOptions(0, isSecureRequest(request)));
  return response;
}
