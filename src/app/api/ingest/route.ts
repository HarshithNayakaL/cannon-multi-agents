import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isAgentId } from '@/lib/agents/types';
import { captureNote } from '@/lib/agents/work/agent';
import { getStore } from '@/lib/db';
import { ingest } from '@/lib/rag/retrieve';
import { today } from '@/lib/utils';

export const runtime = 'nodejs';

const bodySchema = z.object({
  agent: z.string().refine(isAgentId, 'agent must be "fitness" or "work"'),
  content: z.string().min(1).max(20_000),
  source: z.string().min(1).max(64).default('manual'),
  /** Work notes are also written to the notes table, not only the vector store. */
  asNote: z.boolean().default(false),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body.', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { agent, content, source, asNote } = parsed.data;

  try {
    if (agent === 'work' && asNote) {
      const note = await captureNote(content, source, today());
      return NextResponse.json({ ok: true, noteId: note.id, chunks: 1 });
    }

    const store = await getStore();
    const result = await ingest(store, agent, content, { source, date: today() });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[cannon] ingest failed', error);
    return NextResponse.json({ error: 'Ingestion failed.' }, { status: 500 });
  }
}
