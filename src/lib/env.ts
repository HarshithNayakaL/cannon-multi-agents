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
  googleModel: 'gemini-3.6-flash',
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

/** API paths Supabase's own dashboard shows, which people paste by mistake. */
const SUPABASE_API_SUFFIX = /\/(rest|auth|storage|realtime|graphql|functions)(\/v\d+)?\/?$/i;

/**
 * Supabase's client appends `/rest/v1/...` to whatever it is given, so the
 * value has to be the bare project origin. Anything extra — a trailing slash,
 * or a pasted `/rest/v1` from the dashboard — produces a malformed path and
 * every request fails with an opaque "Invalid path specified in request URL".
 *
 * Hosted projects can be reduced to their origin outright, since a
 * `*.supabase.co` project never lives under a path. Self-hosted deployments
 * legitimately can, so those only get the trailing slash and a known API
 * suffix trimmed.
 */
export function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (/(^|\.)supabase\.(co|in)$/i.test(parsed.hostname)) return parsed.origin;

  return `${parsed.origin}${parsed.pathname.replace(SUPABASE_API_SUFFIX, '').replace(/\/+$/, '')}`;
}

function baseUrl(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = str(source, key);
    if (value !== undefined) return normalizeSupabaseUrl(value);
  }
  return undefined;
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

    supabaseUrl: baseUrl(source, 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
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
