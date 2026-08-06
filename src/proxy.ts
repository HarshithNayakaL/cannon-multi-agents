import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

/**
 * Single gate in front of every workspace route and agent API.
 *
 * Runs on the edge runtime, so the session check uses `jose` (WebCrypto)
 * rather than anything Node-specific.
 */
export async function proxy(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const signIn = new URL('/signin', request.url);
  signIn.searchParams.set('next', pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ['/fitness/:path*', '/work/:path*', '/api/agents/:path*', '/api/ingest'],
};
