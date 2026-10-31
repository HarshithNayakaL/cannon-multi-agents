import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import type { LanguageModelV4 } from '@ai-sdk/provider';

import type { AgentId } from '@/lib/agents/types';
import { DemoLanguageModel } from '@/lib/ai/demo-model';
import { createFallbackModel, type FallbackEvent } from '@/lib/ai/fallback';
import { parseModelKey, type ModelInfo } from '@/lib/ai/catalog';
import { catalogModels } from '@/lib/ai/live-models';
import { readEnv } from '@/lib/env';

export type ModelChain = {
  model: LanguageModelV4;
  /** Ordered provider labels, primary first — surfaced in the Prompt Inspector. */
  chain: string[];
  simulated: boolean;
};

/**
 * Catalog entries this deployment has keys for — the offline answer. Pages use
 * `listModels()` from `live-models.ts`, which asks the providers instead.
 */
export function availableModels(env = readEnv()): ModelInfo[] {
  return catalogModels(env);
}

/**
 * Groq primary, Gemini fallback, simulated last.
 *
 * Ordering is deliberate: Groq is the fastest free tier and owns the
 * time-to-first-token budget; Gemini is a different vendor entirely, so a
 * Groq outage or quota exhaustion does not take the assistant down with it.
 *
 * `preferredKey` lets the caller pin a model to the front of the chain. The
 * rest of the chain stays behind it, so an explicit choice still degrades
 * rather than failing outright.
 *
 * `listed` is the live model list. When given, a pin is honoured if the
 * provider lists it (so a model that appeared this week can be chosen), and a
 * configured default the provider no longer lists is replaced by the first
 * model it does — a deprecation upstream then costs nothing here.
 */
export function resolveModel(
  agent: AgentId,
  onFallback?: (event: FallbackEvent) => void,
  preferredKey?: string,
  listed?: ModelInfo[],
): ModelChain {
  const env = readEnv();
  const models: LanguageModelV4[] = [];
  const chain: string[] = [];

  const groq = env.groqApiKey ? createGroq({ apiKey: env.groqApiKey }) : null;
  const google = env.googleApiKey ? createGoogleGenerativeAI({ apiKey: env.googleApiKey }) : null;

  const add = (provider: 'groq' | 'google', modelId: string) => {
    const label = `${provider}:${modelId}`;
    if (chain.includes(label)) return;
    if (provider === 'groq' && groq) {
      models.push(groq.languageModel(modelId) as LanguageModelV4);
      chain.push(label);
    } else if (provider === 'google' && google) {
      models.push(google.languageModel(modelId) as LanguageModelV4);
      chain.push(label);
    }
  };

  // An explicit pick goes first; unknown keys are ignored rather than trusted.
  const pinned = listed?.find((entry) => entry.key === preferredKey);
  const preferred = pinned
    ? { provider: pinned.provider, modelId: pinned.modelId }
    : parseModelKey(preferredKey);
  if (preferred) add(preferred.provider, preferred.modelId);

  const defaultFor = (provider: 'groq' | 'google', configured: string) => {
    if (!listed) return configured;
    const own = listed.filter((entry) => entry.provider === provider);
    // No live entries for this provider means no listing to judge by.
    if (own.length === 0 || own.some((entry) => entry.modelId === configured)) return configured;
    return own[0].modelId;
  };

  add('groq', defaultFor('groq', env.groqModel));
  add('google', defaultFor('google', env.googleModel));

  if (models.length === 0) {
    const demo = new DemoLanguageModel(agent);
    return { model: demo, chain: [`simulated:${demo.modelId}`], simulated: true };
  }

  return {
    model: models.length === 1 ? models[0] : createFallbackModel(models, { onFallback }),
    chain,
    simulated: false,
  };
}
