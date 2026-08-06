import { NextResponse } from 'next/server';

import { describeCapabilities } from '@/lib/env';

export const runtime = 'nodejs';

/** Deployment self-description — which backends are live, which are fallbacks. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'cannon',
    capabilities: describeCapabilities(),
    timestamp: new Date().toISOString(),
  });
}
