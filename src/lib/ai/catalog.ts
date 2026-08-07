/**
 * The model catalog.
 *
 * Every entry is a model the installed provider SDKs actually accept — the
 * Groq ids come from `GroqChatModelId` in `@ai-sdk/groq`, the Google ids from
 * Google's current stable line. Throughput figures are the providers' own
 * published numbers, kept here so the picker can say *why* one model beats
 * another for a given job rather than just listing names.
 */

export type ProviderId = 'groq' | 'google';

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  /** Which env var switches this provider on. */
  envKey: string;
  accent: string;
  blurb: string;
};

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  groq: {
    id: 'groq',
    name: 'Groq',
    envKey: 'GROQ_API_KEY',
    accent: '#f55036',
    blurb: 'Custom inference hardware. Owns the time-to-first-token budget.',
  },
  google: {
    id: 'google',
    name: 'Google',
    envKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    accent: '#4c8dff',
    blurb: 'A different vendor entirely, so an outage here is uncorrelated.',
  },
};

export type ModelInfo = {
  /** `provider:modelId`, the key used everywhere in the UI and API. */
  key: string;
  provider: ProviderId;
  modelId: string;
  name: string;
  /** Published tokens/sec, where the provider states one. */
  speed?: number;
  contextTokens: number;
  /** Short, honest description of what this model is actually for. */
  strength: string;
  /** Tags the recommender scores against. */
  traits: ModelTrait[];
};

export type ModelTrait = 'fastest' | 'balanced' | 'reasoning' | 'long-context' | 'economical';

export const MODELS: ModelInfo[] = [
  {
    key: 'groq:llama-3.3-70b-versatile',
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B',
    speed: 280,
    contextTokens: 131_072,
    strength: 'The default. Strongest general tool-calling of the Groq line.',
    traits: ['balanced', 'reasoning'],
  },
  {
    key: 'groq:openai/gpt-oss-120b',
    provider: 'groq',
    modelId: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    speed: 500,
    contextTokens: 131_072,
    strength: 'Heaviest reasoning available here, and still fast.',
    traits: ['reasoning', 'balanced'],
  },
  {
    key: 'groq:openai/gpt-oss-20b',
    provider: 'groq',
    modelId: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    speed: 1000,
    contextTokens: 131_072,
    strength: 'Fastest in the catalog. Good when the tool call is obvious.',
    traits: ['fastest', 'economical'],
  },
  {
    key: 'groq:llama-3.1-8b-instant',
    provider: 'groq',
    modelId: 'llama-3.1-8b-instant',
    name: 'Llama 3.1 8B',
    speed: 560,
    contextTokens: 131_072,
    strength: 'Cheapest per token. Fine for capture, weak on judgement.',
    traits: ['fastest', 'economical'],
  },
  {
    key: 'groq:moonshotai/kimi-k2-instruct-0905',
    provider: 'groq',
    modelId: 'moonshotai/kimi-k2-instruct-0905',
    name: 'Kimi K2',
    contextTokens: 262_144,
    strength: 'Built for long agentic chains and wide context.',
    traits: ['long-context', 'reasoning'],
  },
  {
    key: 'groq:qwen/qwen3-32b',
    provider: 'groq',
    modelId: 'qwen/qwen3-32b',
    name: 'Qwen3 32B',
    contextTokens: 131_072,
    strength: 'Step-by-step reasoning at a mid-size footprint.',
    traits: ['reasoning', 'balanced'],
  },
  {
    key: 'google:gemini-3.6-flash',
    provider: 'google',
    modelId: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    contextTokens: 1_048_576,
    strength: 'The fallback. Million-token context and strong tool use.',
    traits: ['balanced', 'long-context', 'reasoning'],
  },
  {
    key: 'google:gemini-3.1-flash-lite',
    provider: 'google',
    modelId: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    contextTokens: 1_048_576,
    strength: 'Cheapest Google option with the same huge context window.',
    traits: ['economical', 'long-context', 'fastest'],
  },
];

export function findModel(key: string): ModelInfo | undefined {
  return MODELS.find((model) => model.key === key);
}

export function modelsByProvider(provider: ProviderId): ModelInfo[] {
  return MODELS.filter((model) => model.provider === provider);
}

/** Parses a `provider:modelId` key, rejecting anything not in the catalog. */
export function parseModelKey(key: unknown): { provider: ProviderId; modelId: string } | null {
  if (typeof key !== 'string') return null;
  const model = findModel(key);
  return model ? { provider: model.provider, modelId: model.modelId } : null;
}

export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M`;
  return `${Math.round(tokens / 1024)}K`;
}
