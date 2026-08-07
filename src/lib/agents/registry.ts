import { financeAgent } from '@/lib/agents/finance/agent';
import { fitnessAgent } from '@/lib/agents/fitness/agent';
import { learningAgent } from '@/lib/agents/learning/agent';
import { workAgent } from '@/lib/agents/work/agent';
import { AGENT_IDS, isAgentId, type AgentDefinition, type AgentId } from '@/lib/agents/types';

const REGISTRY: Record<AgentId, AgentDefinition> = {
  fitness: fitnessAgent,
  work: workAgent,
  finance: financeAgent,
  learning: learningAgent,
};

export const agents: AgentDefinition[] = AGENT_IDS.map((id) => REGISTRY[id]);

export function getAgent(id: AgentId): AgentDefinition {
  return REGISTRY[id];
}

/**
 * Explicit selection only — v1 has no auto-router, so an unknown id is a
 * client bug and must fail loudly rather than default to an agent.
 */
export function resolveAgent(id: unknown): AgentDefinition | null {
  return isAgentId(id) ? REGISTRY[id] : null;
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
  };
}

export { AGENT_IDS, isAgentId };
export type { AgentDefinition, AgentId };
