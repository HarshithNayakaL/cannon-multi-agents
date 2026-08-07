import { NextResponse } from 'next/server';

import { resolveAgent } from '@/lib/agents/registry';
import { getStore } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent: agentParam } = await params;

  const store = await getStore();
  const agent = await resolveAgent(agentParam, store);
  if (!agent) {
    return NextResponse.json({ error: `Unknown agent "${agentParam}".` }, { status: 404 });
  }

  const messages = await store.listMessages(agent.id);

  return NextResponse.json({ agent: agent.id, messages, storage: store.kind });
}
