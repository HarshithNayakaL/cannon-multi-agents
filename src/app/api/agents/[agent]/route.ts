import { NextResponse } from 'next/server';

import { isBuiltinAgentId } from '@/lib/agents/types';
import { getStore } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Deletes a created agent and everything it recorded.
 *
 * The four built-in desks are code, not rows, so deleting one is refused
 * rather than silently doing nothing — a 200 on an impossible operation is
 * how a UI ends up showing a desk that it believes it removed.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ agent: string }> },
) {
  const { agent } = await params;

  if (isBuiltinAgentId(agent)) {
    return NextResponse.json(
      { error: `"${agent}" is a built-in desk and cannot be deleted.` },
      { status: 409 },
    );
  }

  try {
    const store = await getStore();
    const deleted = await store.deleteAgent(agent);
    if (!deleted) {
      return NextResponse.json({ error: `Unknown agent "${agent}".` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, agent });
  } catch (error) {
    console.error(`[cannon] deleting ${agent} failed`, error);
    return NextResponse.json({ error: 'Could not delete the agent.' }, { status: 502 });
  }
}
