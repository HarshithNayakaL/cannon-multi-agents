import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import type { LanguageModelV4 } from '@ai-sdk/provider';

import type { AgentId } from '@/lib/agents/types';
import { DemoLanguageModel } from '@/lib/ai/demo-model';
import { createFallbackModel, type FallbackEvent } from '@/lib/ai/fallback';
import { readEnv } from '@/lib/env';

export type ModelChain = {
  model: LanguageModelV4;
  /** Ordered provider labels, primary first — surfaced in the Prompt Inspector. */
  chain: string[];
  simulated: boolean;
};

/**
 * Groq primary, Gemini fallback, simulated last.
 *
 * Ordering is deliberate: Groq is the fastest free tier and owns the
 * time-to-first-token budget; Gemini is a different vendor entirely, so a
 * Groq outage or quota exhaustion does not take the assistant down with it.
 */
export function resolveModel(
  agent: AgentId,
  onFallback?: (event: FallbackEvent) => void,
): ModelChain {
  const env = readEnv();
  const models: LanguageModelV4[] = [];
  const chain: string[] = [];

  if (env.groqApiKey) {
    const groq = createGroq({ apiKey: env.groqApiKey });
    models.push(groq.languageModel(env.groqModel) as LanguageModelV4);
    chain.push(`groq:${env.groqModel}`);
  }

  if (env.googleApiKey) {
    const google = createGoogleGenerativeAI({ apiKey: env.googleApiKey });
    models.push(google.languageModel(env.googleModel) as LanguageModelV4);
    chain.push(`google:${env.googleModel}`);
  }

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
