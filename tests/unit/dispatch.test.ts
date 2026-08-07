import { describe, expect, it } from 'vitest';

import { rankAgents, recommendAgent, recommendModel, tokenize } from '@/lib/agents/dispatch';
import { builtinAgents, toProfile } from '@/lib/agents/registry';
import { MODELS, findModel, formatContext, parseModelKey } from '@/lib/ai/catalog';

const PROFILES = builtinAgents.map(toProfile);

describe('routing', () => {
  it('sends each desk its own vocabulary', () => {
    expect(recommendAgent('bench press 4x8 at 72.5kg', PROFILES)?.agentId).toBe('fitness');
    expect(recommendAgent("what's slipping this week?", PROFILES)?.agentId).toBe('work');
    expect(recommendAgent('spent 840 at BigBasket on groceries', PROFILES)?.agentId).toBe(
      'finance',
    );
    expect(recommendAgent('add the RAG survey paper to my queue', PROFILES)?.agentId).toBe(
      'learning',
    );
  });

  it('ranks the whole field rather than returning one answer', () => {
    const ranked = rankAgents('log my squat session', PROFILES);
    expect(ranked).toHaveLength(PROFILES.length);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
  });

  it('declines to guess when nothing matched, instead of defaulting to a desk', () => {
    expect(recommendAgent('hello there', PROFILES)).toBeNull();
    // Still ranked and returned, just all at zero — the UI shows the field.
    expect(rankAgents('hello there', PROFILES).every((match) => match.confidence === 0)).toBe(true);
  });

  it('reports the words that earned the match so the UI can justify itself', () => {
    const match = recommendAgent('how much did I spend on subscriptions?', PROFILES);
    expect(match?.matched).toContain('spend');
    expect(match?.matched).toContain('subscription');
  });

  it('normalises confidence against the top scorer', () => {
    const [top] = rankAgents('bench press volume trend', PROFILES);
    expect(top.confidence).toBe(1);
  });

  it('matches simple inflections without a stemmer', () => {
    expect(tokenize('Books, papers & courses!')).toEqual(['books', 'papers', 'courses']);
    expect(recommendAgent('which books are queued', PROFILES)?.agentId).toBe('learning');
  });
});

describe('model recommendation', () => {
  it('picks a reasoner when the request asks for judgement', () => {
    const pick = recommendModel('why is my bench stalling and what should I adjust?');
    expect(pick?.model.traits).toContain('reasoning');
  });

  it('picks the fastest model for a short capture', () => {
    const pick = recommendModel('bench 4x8 72.5kg');
    expect(pick?.model.traits).toContain('fastest');
  });

  it('picks the widest window for a wall of pasted text', () => {
    const pick = recommendModel('token '.repeat(80));
    expect(pick?.model.traits).toContain('long-context');
  });

  it('falls back to whatever is configured rather than recommending nothing', () => {
    const only = [MODELS[0]];
    const pick = recommendModel('a short one', only);
    expect(pick?.model.key).toBe(only[0].key);
  });

  it('has nothing to recommend when no provider key is set', () => {
    expect(recommendModel('anything', [])).toBeNull();
  });
});

describe('catalog', () => {
  it('keys are unique and self-describing', () => {
    const keys = MODELS.map((model) => model.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const model of MODELS) {
      expect(model.key).toBe(`${model.provider}:${model.modelId}`);
    }
  });

  // The key crosses the network from the browser, so an unknown one must be
  // dropped rather than forwarded to a provider.
  it('rejects any key that is not in the catalog', () => {
    expect(parseModelKey('groq:llama-3.3-70b-versatile')).toEqual({
      provider: 'groq',
      modelId: 'llama-3.3-70b-versatile',
    });
    expect(parseModelKey('groq:not-a-real-model')).toBeNull();
    expect(parseModelKey('../../etc/passwd')).toBeNull();
    expect(parseModelKey(undefined)).toBeNull();
    expect(parseModelKey(42)).toBeNull();
    expect(findModel('nope')).toBeUndefined();
  });

  it('formats context windows at the scale a person reads them', () => {
    expect(formatContext(131_072)).toBe('128K');
    expect(formatContext(1_048_576)).toBe('1M');
  });

  it('covers every trait the recommender can ask for', () => {
    for (const trait of [
      'fastest',
      'balanced',
      'reasoning',
      'long-context',
      'economical',
    ] as const) {
      expect(MODELS.some((model) => model.traits.includes(trait))).toBe(true);
    }
  });
});
