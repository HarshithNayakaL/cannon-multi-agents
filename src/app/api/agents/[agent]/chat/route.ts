import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from 'ai';
import { NextResponse } from 'next/server';

import { lastUserText, type CannonMetadata, type CannonUIMessage } from '@/lib/agents/message';
import { resolveAgent } from '@/lib/agents/registry';
import { resolveModel } from '@/lib/ai/provider';
import type { FallbackEvent } from '@/lib/ai/fallback';
import { createLeakGuardTransform } from '@/lib/ai/leak-guard';
import { getStore } from '@/lib/db';
import { formatContext, retrieve, type RetrievalTrace } from '@/lib/rag/retrieve';
import type { CannonStore } from '@/lib/db/types';
import type { AgentId } from '@/lib/agents/types';

// Tool execution talks to Supabase, so this handler needs the Node runtime.
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_STEPS = 5;

/**
 * Some Llama models on Groq fall back to writing a tool call as literal
 * text — `<function=name>{...}</function>` — instead of a real structured
 * one, particularly on a later step of a multi-step turn. This one line
 * cannot stop that on its own (it is model-side behaviour), but it lowers
 * how often it happens; `createLeakGuardTransform` below is what actually
 * guarantees the leak never reaches the user or the transcript.
 */
const ANTI_LEAK_CLAUSE =
  'If you need a tool, call it through the tool-calling mechanism only. Never write a tool call as text, in any format — no `<function=...>`, no JSON block standing in for one. If you cannot call a tool, say so instead of simulating the call.';

function emptyTrace(agent: AgentId, query: string): RetrievalTrace {
  return { agent, query, backend: 'local', hits: [] };
}

export async function POST(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent: agentParam } = await params;

  let messages: UIMessage[];
  let preferredModel: string | undefined;
  try {
    const body = (await request.json()) as { messages?: UIMessage[]; model?: unknown };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new Error('messages must be a non-empty array');
    }
    messages = body.messages;
    // Validated against the catalog inside resolveModel; anything unknown is
    // ignored rather than passed through to a provider.
    preferredModel = typeof body.model === 'string' ? body.model : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const query = lastUserText(messages);

  // The store is resolved before the agent, not after: a created agent lives
  // in the database, so there is no way to name the agent in an error message
  // until the store has answered.
  let store: CannonStore;
  try {
    store = await getStore();
  } catch (error) {
    console.error(`[cannon] store unavailable for "${agentParam}"`, error);
    return NextResponse.json(
      { error: 'The data store is unavailable right now.' },
      { status: 503 },
    );
  }

  const agent = await resolveAgent(agentParam, store);
  if (!agent) {
    return NextResponse.json({ error: `Unknown agent "${agentParam}".` }, { status: 404 });
  }

  // Retrieval is a supporting lookup, not the thing the user asked for — a
  // Supabase hiccup here must degrade to "no context" rather than take the
  // whole chat request down with it.
  let trace: RetrievalTrace;
  try {
    // Retrieval is scoped to this agent inside the store query itself, so
    // the fitness agent can never see work documents even by accident.
    trace = await retrieve(store, agent.id, query);
  } catch (error) {
    console.error(`[cannon] ${agent.id} retrieval failed`, error);
    trace = emptyTrace(agent.id, query);
  }

  const fallbacks: NonNullable<CannonMetadata['fallbacks']> = [];
  const { model, chain, simulated } = resolveModel(
    agent.id,
    (event: FallbackEvent) => {
      fallbacks.push({ from: event.from, to: event.to, stage: event.stage });
      console.warn(
        `[cannon] ${agent.id}: ${event.from} failed at ${event.stage}, falling back to ${event.to}`,
      );
    },
    preferredModel,
  );

  const startedAt = Date.now();

  let result: ReturnType<typeof streamText>;
  try {
    result = streamText({
      model,
      system: `${agent.systemPrompt}\n\n${ANTI_LEAK_CLAUSE}\n\n${formatContext(trace)}\n\nToday is ${new Date()
        .toISOString()
        .slice(0, 10)}.`,
      messages: await convertToModelMessages(messages),
      tools: agent.buildTools(store),
      stopWhen: stepCountIs(MAX_STEPS),
      experimental_transform: createLeakGuardTransform(),
      onError: ({ error }) => {
        console.error(`[cannon] ${agent.id} stream error`, error);
      },
    });
  } catch (error) {
    console.error(`[cannon] ${agent.id} failed to start`, error);
    const message = error instanceof Error ? error.message : 'Unknown error.';
    return NextResponse.json(
      { error: `The ${agent.name} agent could not start: ${message}` },
      { status: 502 },
    );
  }

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
