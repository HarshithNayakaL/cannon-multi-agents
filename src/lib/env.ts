/**
 * Environment resolution.
 *
 * Cannon is designed to degrade gracefully: every external dependency
 * (LLM providers, Postgres) has a local fallback so the app boots, builds
 * and tests without a single secret configured. `readEnv` is a pure function
 * over a process env snapshot so this behaviour is unit-testable.
 */

export type CannonEnv = {
  /** Groq API key — primary inference provider. */
  groqApiKey?: string;
  /** Google Generative AI key — fallback inference + embeddings. */
  googleApiKey?: string;
  groqModel: string;
  googleModel: string;
  embeddingModel: string;

  supabaseUrl?: string;
  supabaseServiceKey?: string;
};

const DEFAULTS = {
  groqModel: 'llama-3.3-70b-versatile',
  googleModel: 'gemini-2.0-flash',
  embeddingModel: 'gemini-embedding-001',
} as const;

function str(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = source[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CannonEnv {
  return {
    groqApiKey: str(source, 'GROQ_API_KEY'),
    googleApiKey: str(source, 'GOOGLE_GENERATIVE_AI_API_KEY') ?? str(source, 'GEMINI_API_KEY'),
    groqModel: str(source, 'CANNON_GROQ_MODEL') ?? DEFAULTS.groqModel,
    googleModel: str(source, 'CANNON_GOOGLE_MODEL') ?? DEFAULTS.googleModel,
    embeddingModel: str(source, 'CANNON_EMBEDDING_MODEL') ?? DEFAULTS.embeddingModel,

    supabaseUrl: str(source, 'SUPABASE_URL') ?? str(source, 'NEXT_PUBLIC_SUPABASE_URL'),
    supabaseServiceKey:
      str(source, 'SUPABASE_SERVICE_ROLE_KEY') ?? str(source, 'SUPABASE_SERVICE_KEY'),
  };
}

/** True when the deployment has at least one real inference provider. */
export function hasLiveInference(env: CannonEnv): boolean {
  return Boolean(env.groqApiKey ?? env.googleApiKey);
}

/** True when structured data is persisted in Postgres rather than process memory. */
export function hasDurableStorage(env: CannonEnv): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceKey);
}

export type RuntimeCapabilities = {
  inference: 'groq' | 'google' | 'simulated';
  storage: 'supabase' | 'memory';
  embeddings: 'gemini' | 'local';
};

export function describeCapabilities(env: CannonEnv = readEnv()): RuntimeCapabilities {
  return {
    inference: env.groqApiKey ? 'groq' : env.googleApiKey ? 'google' : 'simulated',
    storage: hasDurableStorage(env) ? 'supabase' : 'memory',
    embeddings: env.googleApiKey ? 'gemini' : 'local',
  };
}
