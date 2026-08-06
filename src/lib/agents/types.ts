import type { ToolSet } from 'ai';

export const AGENT_IDS = ['fitness', 'work'] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && (AGENT_IDS as readonly string[]).includes(value);
}

export type AgentToolSummary = {
  name: string;
  description: string;
  signature: string;
};

export type AgentDefinition = {
  id: AgentId;
  /** Short label used in the rail. */
  name: string;
  /** Full role title shown in the header. */
  title: string;
  tagline: string;
  /** Tailwind-free hex accent, fed into CSS custom properties. */
  accent: string;
  accentSoft: string;
  systemPrompt: string;
  /** Human-readable description of what RAG can reach for this agent. */
  ragSources: string[];
  /** Static documentation of the tool surface, rendered in the inspector. */
  toolSummaries: AgentToolSummary[];
  /** Starter prompts for the empty state. */
  suggestions: string[];
  buildTools: () => ToolSet;
};
