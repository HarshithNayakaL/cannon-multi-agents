import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import type { LanguageModelV4 } from '@ai-sdk/provider';

import type { AgentId } from '@/lib/agents/types';
import { DemoLanguageModel } from '@/lib/ai/demo-model';
import { createFallbackModel, type FallbackEvent } from '@/lib/ai/fallback';
import { MODELS, parseModelKey, type ModelInfo } from '@/lib/ai/catalog';
import { readEnv } from '@/lib/env';

export type ModelChain = {
  model: LanguageModelV4;
  /** Ordered provider labels, primary first — surfaced in the Prompt Inspector. */
  chain: string[];
  simulated: boolean;
};

/** Which catalog entries this deployment actually has keys for. */
export function availableModels(env = readEnv()): ModelInfo[] {
  return MODELS.filter((model) => {
    if (model.provider === 'groq') return Boolean(env.groqApiKey);
    if (model.provider === 'google') return Boolean(env.googleApiKey);
    return false;
  });
}

/**
 * Groq primary, Gemini fallback, simulated last.
 *
 * Ordering is deliberate: Groq is the fastest free tier and owns the
 * time-to-first-token budget; Gemini is a different vendor entirely, so a
 * Groq outage or quota exhaustion does not take the assistant down with it.
 *
 * `preferredKey` lets the caller pin a specific catalog model to the front of
 * the chain. The rest of the chain stays behind it, so an explicit choice
 * still degrades rather than failing outright.
 */
export function resolveModel(
  agent: AgentId,
  onFallback?: (event: FallbackEvent) => void,
  preferredKey?: string,
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
  const preferred = parseModelKey(preferredKey);
  if (preferred) add(preferred.provider, preferred.modelId);

  add('groq', env.groqModel);
  add('google', env.googleModel);

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
