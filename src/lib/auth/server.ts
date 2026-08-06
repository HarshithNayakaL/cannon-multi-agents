import { cookies } from 'next/headers';

import { SESSION_COOKIE, verifySessionToken, type Session } from '@/lib/auth/session';

/** Reads the signed session cookie inside a server component or route handler. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}
