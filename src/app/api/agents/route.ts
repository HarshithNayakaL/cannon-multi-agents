import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateAgent } from '@/lib/agents/custom/generate';
import { hydrate, listAgents, toProfile } from '@/lib/agents/registry';
import { getStore } from '@/lib/db';
import { ingest } from '@/lib/rag/retrieve';

export const runtime = 'nodejs';
// Writing an agent means a model call plus an embedding call.
export const maxDuration = 60;

const bodySchema = z.object({
  description: z.string().min(3).max(600),
});

/** Every agent this deployment has, as client-safe profiles. */
export async function GET() {
  try {
    const agents = await listAgents();
    return NextResponse.json({ agents: agents.map(toProfile) });
  } catch (error) {
    console.error('[cannon] listing agents failed', error);
    return NextResponse.json({ error: 'Could not load agents.' }, { status: 503 });
  }
}

/**
 * Creates an agent from a sentence.
 *
 * The model writes the persona; the slug, the accent and the uniqueness check
 * are decided server-side, because those become a URL and a database key.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Describe what the agent is for.', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let store;
  try {
    store = await getStore();
  } catch (error) {
    console.error('[cannon] store unavailable while creating an agent', error);
    return NextResponse.json(
      { error: 'The data store is unavailable right now.' },
      { status: 503 },
    );
  }

  try {
    const existing = await listAgents(store);

    const { agent, simulated } = await generateAgent(parsed.data.description, {
      taken: existing.map((entry) => entry.id),
      takenAccents: existing.map((entry) => entry.accent),
    });

    const created = await store.createAgent(agent);

    // The founding description is the agent's first memory. Without it a new
    // agent's retrieval is empty on turn one and it has nothing to ground on.
    try {
      await ingest(store, created.id, `This desk exists to: ${parsed.data.description.trim()}`, {
        source: 'record',
        origin: 'creation',
      });
    } catch (error) {
      // The agent exists and works; it just starts with no context.
      console.error(`[cannon] could not seed ${created.id}`, error);
    }

    return NextResponse.json({ agent: toProfile(hydrate(created)), simulated }, { status: 201 });
  } catch (error) {
    console.error('[cannon] agent creation failed', error);
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return NextResponse.json({ error: `Could not create the agent: ${message}` }, { status: 502 });
  }
}
