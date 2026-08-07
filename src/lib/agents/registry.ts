import {
  CUSTOM_RAG_SOURCES,
  CUSTOM_TOOL_SUMMARIES,
  buildCustomTools,
} from '@/lib/agents/custom/tools';
import { financeAgent } from '@/lib/agents/finance/agent';
import { fitnessAgent } from '@/lib/agents/fitness/agent';
import { learningAgent } from '@/lib/agents/learning/agent';
import { workAgent } from '@/lib/agents/work/agent';
import {
  BUILTIN_AGENT_IDS,
  isAgentId,
  isBuiltinAgentId,
  type AgentDefinition,
  type AgentId,
  type BuiltinAgentId,
  type CustomAgent,
} from '@/lib/agents/types';
import { getStore } from '@/lib/db';
import type { CannonStore } from '@/lib/db/types';

const BUILTIN: Record<BuiltinAgentId, AgentDefinition> = {
  fitness: fitnessAgent,
  work: workAgent,
  finance: financeAgent,
  learning: learningAgent,
};

/** The four coded desks, in a stable order. Available synchronously. */
export const builtinAgents: AgentDefinition[] = BUILTIN_AGENT_IDS.map((id) => BUILTIN[id]);

/** Softens a hex accent into the tint used for resting surfaces. */
export function softenAccent(hex: string, alpha = 0.14): string {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return `rgba(120, 120, 120, ${alpha})`;
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

/**
 * A stored agent is data; this makes it behave like the coded ones. Its tools,
 * retrieval sources and tool documentation are the generic set — identical for
 * every created agent, because the prompt is what differs between them, not
 * the machinery.
 */
export function hydrate(stored: CustomAgent): AgentDefinition {
  return {
    id: stored.id,
    name: stored.name,
    title: stored.title,
    tagline: stored.tagline,
    accent: stored.accent,
    accentSoft: softenAccent(stored.accent),
    systemPrompt: stored.systemPrompt,
    ragSources: CUSTOM_RAG_SOURCES,
    toolSummaries: CUSTOM_TOOL_SUMMARIES,
    suggestions: stored.suggestions,
    keywords: stored.keywords,
    custom: true,
    buildTools: buildCustomTools(stored.id),
  };
}

/**
 * Every agent this deployment currently has: the four coded desks first, then
 * whatever the user has created, oldest first.
 *
 * A store failure degrades to the built-in desks rather than taking the whole
 * app down — losing the custom agents from the rail is bad, serving a 500 on
 * every route because the database blinked is worse.
 */
export async function listAgents(store?: CannonStore): Promise<AgentDefinition[]> {
  try {
    const resolved = store ?? (await getStore());
    const custom = await resolved.listAgents();
    return [...builtinAgents, ...custom.map(hydrate)];
  } catch (error) {
    console.error('[cannon] could not load custom agents', error);
    return builtinAgents;
  }
}

/**
 * Resolves an id to a definition, or null when it does not exist. Built-in
 * ids never touch the database; anything else is looked up.
 */
export async function resolveAgent(
  id: unknown,
  store?: CannonStore,
): Promise<AgentDefinition | null> {
  if (!isAgentId(id)) return null;
  if (isBuiltinAgentId(id)) return BUILTIN[id];

  const resolved = store ?? (await getStore());
  const stored = await resolved.findAgent(id);
  return stored ? hydrate(stored) : null;
}

/** Synchronous lookup, built-in desks only. Used where the store is not reachable. */
export function getBuiltinAgent(id: BuiltinAgentId): AgentDefinition {
  return BUILTIN[id];
}

/** Serialisable slice of an agent, safe to hand to client components. */
export type AgentProfile = Omit<AgentDefinition, 'buildTools' | 'systemPrompt'>;

/**
 * Fields are copied explicitly rather than spread-and-omitted: this function
 * is the server/client boundary, and an allowlist guarantees a future
 * server-only field on an agent can never leak into the browser bundle.
 *
 * `systemPrompt` is deliberately absent. It is the agent's instructions, not
 * product surface, so it stays server-side rather than riding along in the
 * RSC payload where anyone can read it.
 */
export function toProfile(agent: AgentDefinition): AgentProfile {
  return {
    id: agent.id,
    name: agent.name,
    title: agent.title,
    tagline: agent.tagline,
    accent: agent.accent,
    accentSoft: agent.accentSoft,
    ragSources: agent.ragSources,
    toolSummaries: agent.toolSummaries,
    suggestions: agent.suggestions,
    keywords: agent.keywords,
    custom: agent.custom,
  };
}

export async function listProfiles(store?: CannonStore): Promise<AgentProfile[]> {
  return (await listAgents(store)).map(toProfile);
}

export { BUILTIN_AGENT_IDS, isAgentId, isBuiltinAgentId };
export type { AgentDefinition, AgentId };
