import { NextResponse } from 'next/server';

import { resolveAgent } from '@/lib/agents/registry';
import { getSession } from '@/lib/auth/server';
import { getStore } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { agent: agentParam } = await params;
  const agent = resolveAgent(agentParam);
  if (!agent) {
    return NextResponse.json({ error: `Unknown agent "${agentParam}".` }, { status: 404 });
  }

  const store = await getStore();
  const messages = await store.listMessages(agent.id);

  return NextResponse.json({ agent: agent.id, messages, storage: store.kind });
}
