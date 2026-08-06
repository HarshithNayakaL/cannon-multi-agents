import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import { NextResponse } from 'next/server';

import { lastUserText, type CannonMetadata, type CannonUIMessage } from '@/lib/agents/message';
import { resolveAgent } from '@/lib/agents/registry';
import { resolveModel } from '@/lib/ai/provider';
import type { FallbackEvent } from '@/lib/ai/fallback';
import { getSession } from '@/lib/auth/server';
import { getStore } from '@/lib/db';
import { enforceRateLimit } from '@/lib/ratelimit';
import { formatContext, retrieve } from '@/lib/rag/retrieve';

// Tool execution talks to Supabase, so this handler needs the Node runtime.
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_STEPS = 5;

export async function POST(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { agent: agentParam } = await params;
  const agent = resolveAgent(agentParam);
  if (!agent) {
    return NextResponse.json({ error: `Unknown agent "${agentParam}".` }, { status: 404 });
  }

  const limit = await enforceRateLimit(`${session.email}:${agent.id}`);
  if (!limit.success) {
    return NextResponse.json(
      {
        error: `Rate limit reached for the ${agent.name} agent. Try again shortly.`,
        reset: limit.reset,
      },
      {
        status: 429,
        headers: { 'retry-after': String(Math.ceil((limit.reset - Date.now()) / 1000)) },
      },
    );
  }

  let messages: UIMessage[];
  try {
    const body = (await request.json()) as { messages?: UIMessage[] };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new Error('messages must be a non-empty array');
    }
    messages = body.messages;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const store = await getStore();
  const query = lastUserText(messages);

  // Retrieval is scoped to this agent inside the store query itself, so the
  // fitness agent can never see work documents even by accident.
  const trace = await retrieve(store, agent.id, query);

  const fallbacks: NonNullable<CannonMetadata['fallbacks']> = [];
  const { model, chain, simulated } = resolveModel(agent.id, (event: FallbackEvent) => {
    fallbacks.push({ from: event.from, to: event.to, stage: event.stage });
    console.warn(
      `[cannon] ${agent.id}: ${event.from} failed at ${event.stage}, falling back to ${event.to}`,
    );
  });

  const startedAt = Date.now();

  const result = streamText({
    model,
    system: `${agent.systemPrompt}\n\n${formatContext(trace)}\n\nToday is ${new Date()
      .toISOString()
      .slice(0, 10)}.`,
    messages: await convertToModelMessages(messages),
    tools: agent.buildTools(),
    stopWhen: stepCountIs(MAX_STEPS),
    onError: ({ error }) => {
      console.error(`[cannon] ${agent.id} stream error`, error);
    },
  });

  return result.toUIMessageStreamResponse<CannonUIMessage>({
    originalMessages: messages as CannonUIMessage[],
    messageMetadata: ({ part }): CannonMetadata | undefined => {
      if (part.type === 'start') {
        return { agent: agent.id, chain, simulated, retrieval: trace };
      }
      if (part.type === 'finish') {
        return {
          agent: agent.id,
          chain,
          simulated,
          retrieval: trace,
          fallbacks,
          latencyMs: Date.now() - startedAt,
        };
      }
      return undefined;
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unknown inference error.';
      return `The ${agent.name} agent could not complete that request: ${message}`;
    },
    // Only this turn is appended. `messages` on the callback is the whole
    // conversation, so writing that would re-insert every earlier turn on
    // every request.
    onFinish: async ({ responseMessage }) => {
      const lastTurn = messages[messages.length - 1];
      try {
        await store.appendMessages([
          ...(lastTurn?.role === 'user'
            ? [{ agent: agent.id, role: 'user' as const, parts: lastTurn.parts }]
            : []),
          { agent: agent.id, role: responseMessage.role, parts: responseMessage.parts },
        ]);
      } catch (error) {
        // Persistence failing must not corrupt a response the user already read.
        console.error(`[cannon] ${agent.id} persistence failed`, error);
      }
    },
  });
}
