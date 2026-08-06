/**
 * Environment resolution.
 *
 * Cannon is designed to degrade gracefully: every external dependency
 * (LLM providers, Postgres, Redis) has a local fallback so the app boots,
 * builds and tests without a single secret configured. `readEnv` is a pure
 * function over a process env snapshot so this behaviour is unit-testable.
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

  upstashUrl?: string;
  upstashToken?: string;

  /** Signing secret for the session cookie. */
  authSecret: string;
  /** Comma-separated allowlist. Empty means "no allowlist configured". */
  allowedEmails: string[];
  /** Shared passcode. When absent the app runs in open demo mode. */
  authPasscode?: string;

  /** Requests per window, per agent. */
  rateLimitRequests: number;
  rateLimitWindowSeconds: number;
};

const DEFAULTS = {
  groqModel: 'llama-3.3-70b-versatile',
  googleModel: 'gemini-2.0-flash',
  embeddingModel: 'gemini-embedding-001',
  rateLimitRequests: 30,
  rateLimitWindowSeconds: 60,
  /** Only ever used when no secret is supplied (local dev / CI). */
  developmentSecret: 'cannon-development-secret-do-not-use-in-production',
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

function int(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const raw = str(source, key);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CannonEnv {
  const allowlist = (str(source, 'CANNON_ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return {
    groqApiKey: str(source, 'GROQ_API_KEY'),
    googleApiKey: str(source, 'GOOGLE_GENERATIVE_AI_API_KEY') ?? str(source, 'GEMINI_API_KEY'),
    groqModel: str(source, 'CANNON_GROQ_MODEL') ?? DEFAULTS.groqModel,
    googleModel: str(source, 'CANNON_GOOGLE_MODEL') ?? DEFAULTS.googleModel,
    embeddingModel: str(source, 'CANNON_EMBEDDING_MODEL') ?? DEFAULTS.embeddingModel,

    supabaseUrl: str(source, 'SUPABASE_URL') ?? str(source, 'NEXT_PUBLIC_SUPABASE_URL'),
    supabaseServiceKey:
      str(source, 'SUPABASE_SERVICE_ROLE_KEY') ?? str(source, 'SUPABASE_SERVICE_KEY'),

    upstashUrl: str(source, 'UPSTASH_REDIS_REST_URL'),
    upstashToken: str(source, 'UPSTASH_REDIS_REST_TOKEN'),

    authSecret: str(source, 'CANNON_AUTH_SECRET') ?? DEFAULTS.developmentSecret,
    allowedEmails: allowlist,
    authPasscode: str(source, 'CANNON_AUTH_PASSCODE'),

    rateLimitRequests: int(source, 'CANNON_RATE_LIMIT_REQUESTS', DEFAULTS.rateLimitRequests),
    rateLimitWindowSeconds: int(
      source,
      'CANNON_RATE_LIMIT_WINDOW_SECONDS',
      DEFAULTS.rateLimitWindowSeconds,
    ),
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

/**
 * Open demo mode: no passcode configured, so anyone can enter with a
 * throwaway identity. This is what makes the public deployment browsable.
 */
export function isOpenDemo(env: CannonEnv): boolean {
  return env.authPasscode === undefined;
}

export type RuntimeCapabilities = {
  inference: 'groq' | 'google' | 'simulated';
  storage: 'supabase' | 'memory';
  embeddings: 'gemini' | 'local';
  rateLimit: 'upstash' | 'memory';
  demoMode: boolean;
};

export function describeCapabilities(env: CannonEnv = readEnv()): RuntimeCapabilities {
  return {
    inference: env.groqApiKey ? 'groq' : env.googleApiKey ? 'google' : 'simulated',
    storage: hasDurableStorage(env) ? 'supabase' : 'memory',
    embeddings: env.googleApiKey ? 'gemini' : 'local',
    rateLimit: env.upstashUrl && env.upstashToken ? 'upstash' : 'memory',
    demoMode: isOpenDemo(env),
  };
}
