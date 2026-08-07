import { NextResponse } from 'next/server';

import { describeCapabilities, readEnv } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * Deployment self-description — which backends are live, which are fallbacks.
 *
 * Also echoes the *origin* of the configured Supabase URL. That value is not a
 * secret (Supabase ships it to browsers in every normal client app) and it is
 * the single most common thing to get wrong: a trailing slash, a pasted
 * dashboard URL, or a stray path all fail identically at request time with an
 * opaque gateway error. Surfacing it turns "guess the config" into "read it".
 * The service key is never echoed.
 */
export async function GET() {
  const env = readEnv();

  let supabaseOrigin: string | null = null;
  let supabaseUrlLooksValid: boolean | null = null;

  if (env.supabaseUrl) {
    try {
      const parsed = new URL(env.supabaseUrl);
      supabaseOrigin = parsed.origin;
      // A correct project URL is a bare origin — no path segments.
      supabaseUrlLooksValid = parsed.pathname === '/' || parsed.pathname === '';
    } catch {
      supabaseOrigin = 'unparseable';
      supabaseUrlLooksValid = false;
    }
  }

  return NextResponse.json({
    ok: true,
    service: 'cannon',
    capabilities: describeCapabilities(env),
    config: {
      supabaseOrigin,
      supabaseUrlLooksValid,
      googleModel: env.googleModel,
      groqModel: env.groqModel,
    },
    timestamp: new Date().toISOString(),
  });
}
