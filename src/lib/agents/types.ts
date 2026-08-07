import type { ToolSet } from 'ai';

import type { CannonStore } from '@/lib/db/types';

/**
 * The four desks that ship with hand-written prompts and purpose-built tools.
 * They are not the whole roster — an agent can be created at runtime — but
 * they are the ones whose behaviour is code rather than data.
 */
export const BUILTIN_AGENT_IDS = ['fitness', 'work', 'finance', 'learning'] as const;

export type BuiltinAgentId = (typeof BUILTIN_AGENT_IDS)[number];

/**
 * Deliberately `string`, not a union.
 *
 * Agents are created by the user at runtime, so the set is open and only the
 * registry knows what is currently valid. A union here would be a lie the
 * compiler enforces: every custom id would need casting at the boundary, and
 * the casts would be the only thing standing between a typo and a database
 * write. Validation belongs in `isAgentId`, which checks the *shape*, and in
 * `resolveAgent`, which checks *existence*.
 */
export type AgentId = string;

/**
 * A slug is lowercase, starts with a letter, and contains only letters,
 * digits and single hyphens. It becomes a URL segment and a database key, so
 * the constraint is narrow on purpose.
 */
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const MAX_SLUG_LENGTH = 32;

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && value.length <= MAX_SLUG_LENGTH && SLUG.test(value);
}

export function isBuiltinAgentId(value: unknown): value is BuiltinAgentId {
  return typeof value === 'string' && (BUILTIN_AGENT_IDS as readonly string[]).includes(value);
}

/** Route segments that can never be an agent, because the app owns them. */
const RESERVED = new Set(['api', 'new', 'dispatch', 'static', 'public', 'favicon', '_next']);

export function isReservedAgentId(value: string): boolean {
  return RESERVED.has(value);
}

/** Turns free text into a usable slug, or null when nothing survives. */
export function toSlug(raw: string): string | null {
  const slug = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');

  return isAgentId(slug) && !isReservedAgentId(slug) ? slug : null;
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
  /**
   * Vocabulary this desk owns. The dispatcher scores an incoming request
   * against these, so they should be the words a person actually types —
   * not a description of the domain.
   */
  keywords: string[];
  /**
   * False for the four coded desks, true for anything the user made. Only the
   * UI cares: a custom agent can be deleted, a built-in one cannot.
   */
  custom: boolean;
  /**
   * The store is passed in rather than imported so a custom agent's generic
   * tools can close over the same instance the request already resolved.
   */
  buildTools: (store: CannonStore) => ToolSet;
};

/** The persisted half of a user-created agent. Everything else is derived. */
export type CustomAgent = {
  id: AgentId;
  name: string;
  title: string;
  tagline: string;
  accent: string;
  systemPrompt: string;
  keywords: string[];
  suggestions: string[];
  createdAt: string;
};

export type CustomAgentInput = Omit<CustomAgent, 'createdAt'>;
