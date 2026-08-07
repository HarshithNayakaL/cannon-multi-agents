import type { AgentId } from '@/lib/agents/types';
import { MODELS, type ModelInfo, type ModelTrait } from '@/lib/ai/catalog';

/**
 * Dispatch: which desk should take this, and on which model.
 *
 * Deliberately a deterministic scorer rather than an LLM classifier. Routing
 * runs before the first token, so an extra model round-trip would sit in front
 * of every single request; and a wrong guess here sends work to an agent whose
 * tools cannot serve it. Scoring against each desk's own vocabulary is
 * instant, free, explainable in the UI, and unit-testable — an LLM router is
 * only worth it once there is usage data showing this one is not enough.
 *
 * Nothing in this file imports the agent registry. The dispatch screen runs
 * the scorer on every keystroke, which means it runs in the browser, and the
 * registry reaches the tool factories and through them the database. Taking
 * the vocabulary as an argument keeps this module pure and client-safe.
 */

/** The only part of an agent the scorer needs. `AgentProfile` satisfies it. */
export type DispatchAgent = {
  id: AgentId;
  keywords: string[];
};

export type AgentMatch = {
  agentId: AgentId;
  score: number;
  /** 0–1, normalised across the field so the UI can show relative confidence. */
  confidence: number;
  /** The words that actually earned the match, for "why this desk". */
  matched: string[];
};

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/**
 * Scores every desk against the request. Always returns all of them, ranked —
 * the point of the dispatch screen is that the user sees the whole field and
 * overrules the recommendation whenever they like.
 */
export function rankAgents(query: string, candidates: DispatchAgent[]): AgentMatch[] {
  const text = query.toLowerCase();
  const tokens = new Set(tokenize(query));

  const scored = candidates.map((agent) => {
    const matched: string[] = [];
    let score = 0;

    for (const keyword of agent.keywords) {
      if (keyword.includes(' ')) {
        // Multi-word cues are stronger signals than a single token.
        if (text.includes(keyword)) {
          score += 3;
          matched.push(keyword);
        }
        continue;
      }
      if (tokens.has(keyword)) {
        score += 2;
        matched.push(keyword);
        continue;
      }
      // Catch plurals and simple inflections without a stemmer.
      for (const token of tokens) {
        if (token.length > 3 && (token.startsWith(keyword) || keyword.startsWith(token))) {
          score += 1;
          matched.push(keyword);
          break;
        }
      }
    }

    return { agentId: agent.id, score, matched: [...new Set(matched)] };
  });

  const best = Math.max(...scored.map((entry) => entry.score), 0);

  return scored
    .map((entry) => ({
      ...entry,
      confidence: best > 0 ? Math.round((entry.score / best) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.score - a.score || a.agentId.localeCompare(b.agentId));
}

/** The single recommendation, or null when nothing scored above zero. */
export function recommendAgent(query: string, candidates: DispatchAgent[]): AgentMatch | null {
  const [top] = rankAgents(query, candidates);
  return top && top.score > 0 ? top : null;
}

export type ModelRecommendation = {
  model: ModelInfo;
  reason: string;
};

const LONG_QUERY_TOKENS = 60;

const JUDGEMENT = /why|should|compare|explain|analy|plan|strategy|stalling|adjust|recommend/;

/**
 * Picks a model for the shape of the request rather than the topic: short
 * captures want the fastest thing that can call a tool, judgement calls want
 * the strongest reasoner, and a wall of pasted text wants the big window.
 */
export function recommendModel(
  query: string,
  available: ModelInfo[] = MODELS,
): ModelRecommendation | null {
  if (available.length === 0) return null;

  const tokens = tokenize(query);
  const text = query.toLowerCase();

  let trait: ModelTrait;
  let reason: string;

  if (tokens.length > LONG_QUERY_TOKENS) {
    trait = 'long-context';
    reason = 'Long input — favouring the widest context window.';
  } else if (JUDGEMENT.test(text)) {
    trait = 'reasoning';
    reason = 'This asks for judgement, so the stronger reasoner wins.';
  } else if (tokens.length <= 12) {
    trait = 'fastest';
    reason = 'Short capture — the fastest model that can call a tool is enough.';
  } else {
    trait = 'balanced';
    reason = 'General request — the balanced default.';
  }

  const match = available.find((model) => model.traits.includes(trait));
  if (match) return { model: match, reason };

  return { model: available[0], reason: 'The only model this deployment has a key for.' };
}
