import { MODELS, type ModelInfo, type ModelTrait, type ProviderId } from '@/lib/ai/catalog';
import { readEnv, type CannonEnv } from '@/lib/env';

/**
 * The live model list.
 *
 * The catalog in `catalog.ts` is a snapshot, and providers do not hold still:
 * Groq retired Kimi K2 and Qwen3 32B and shipped Qwen3.8 within a few months.
 * A hard-coded list goes stale in both directions — it offers models that now
 * 404, and it never shows the new ones.
 *
 * So the list is the provider's own answer to "what can this key call right
 * now", fetched from each `/models` endpoint. The catalog is demoted to
 * annotations: when a live model is one we know, it keeps our speed figure and
 * our one-line note; when it is not, it is still listed, marked new, with what
 * the provider itself says about it.
 *
 * If a provider cannot be reached the catalog stands in for it, so an outage
 * of the listing endpoint never empties the picker.
 */

export type ModelSource = 'live' | 'catalog';

export type ModelListing = {
  models: ModelInfo[];
  /** Per provider: whether the list came from its API or the fallback catalog. */
  sources: Partial<Record<ProviderId, ModelSource>>;
};

/** Re-ask the providers at most this often. */
const TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 4000;

/** What a provider listing is reduced to before merging. */
export type RawModel = {
  provider: ProviderId;
  modelId: string;
  displayName?: string;
  contextTokens?: number;
};

// --------------------------------------------------------------------------
// Filtering: the listing endpoints return every model the key can reach,
// including speech, embeddings, safety classifiers and image generators.
// Only chat models that can drive tool calls belong in the picker.
// --------------------------------------------------------------------------

const GROQ_NON_CHAT =
  /whisper|orpheus|tts|playai|guard|safeguard|distil|embed|compound|allam|vision-only/i;

export function isGroqChatModel(id: string): boolean {
  return !GROQ_NON_CHAT.test(id);
}

const GOOGLE_NON_CHAT =
  /embedding|embed|aqa|imagen|veo|tts|image|live|native-audio|learnlm|gemma|robotics|computer-use|-exp\b|exp-\d/i;

/**
 * Google lists every pinned revision (`-001`, `-002`) and rolling alias
 * (`-latest`) beside the base id. Those are the same model under another
 * name; showing all of them would triple the list for no choice at all.
 */
const GOOGLE_ALIAS = /-\d{3}$|-latest$/;

export function isGoogleChatModel(id: string): boolean {
  return id.startsWith('gemini') && !GOOGLE_NON_CHAT.test(id) && !GOOGLE_ALIAS.test(id);
}

// --------------------------------------------------------------------------
// Annotation for models the catalog has never seen.
// --------------------------------------------------------------------------

/** `qwen/qwen3.8-27b` → `Qwen3.8 27B`; `gemini-3.7-pro` → `Gemini 3.7 Pro`. */
export function prettyModelName(id: string): string {
  const base = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  return base
    .split('-')
    .filter((part) => part.length > 0 && part !== 'instruct' && !/^\d{4}$/.test(part))
    .map((part) => {
      if (/^\d+(\.\d+)?[bmk]$/i.test(part)) return part.toUpperCase();
      if (/^(gpt|oss)$/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

export function inferTraits(id: string, contextTokens: number): ModelTrait[] {
  const traits = new Set<ModelTrait>();
  if (/instant|lite|mini|nano|flash-8b|\b[1-9]b\b|-(?:1|3|7|8|9|20)b\b/i.test(id)) {
    traits.add('fastest');
    traits.add('economical');
  }
  if (/pro|120b|70b|reason|think|qwen|k2|m2/i.test(id)) traits.add('reasoning');
  if (contextTokens >= 500_000) traits.add('long-context');
  if (!traits.has('fastest')) traits.add('balanced');
  return [...traits];
}

const DEFAULT_CONTEXT: Record<ProviderId, number> = {
  groq: 131_072,
  google: 1_048_576,
};

/**
 * Pure: provider listings in, picker entries out.
 *
 * Order follows the catalog for known models (so the curated defaults stay at
 * the top), then new arrivals after them. A catalog model absent from a live
 * listing is dropped — it is deprecated or the key cannot reach it, and
 * offering it would only produce a 404 on the next turn.
 */
export function mergeListing(
  raw: RawModel[],
  liveProviders: ProviderId[],
  catalog: ModelInfo[] = MODELS,
): ModelInfo[] {
  const byKey = new Map(raw.map((model) => [`${model.provider}:${model.modelId}`, model]));

  const known: ModelInfo[] = [];
  for (const entry of catalog) {
    if (!liveProviders.includes(entry.provider)) continue;
    const live = byKey.get(entry.key);
    if (!live) continue;
    known.push({
      ...entry,
      contextTokens: live.contextTokens ?? entry.contextTokens,
    });
    byKey.delete(entry.key);
  }

  const fresh: ModelInfo[] = [...byKey.values()]
    .sort((a, b) => a.modelId.localeCompare(b.modelId))
    .map((model) => {
      const context = model.contextTokens ?? DEFAULT_CONTEXT[model.provider];
      return {
        key: `${model.provider}:${model.modelId}`,
        provider: model.provider,
        modelId: model.modelId,
        name: model.displayName ?? prettyModelName(model.modelId),
        contextTokens: context,
        strength: 'Newly listed by the provider. No notes on it yet.',
        traits: inferTraits(model.modelId, context),
        isNew: true,
      };
    });

  return [...known, ...fresh];
}

// --------------------------------------------------------------------------
// Fetching
// --------------------------------------------------------------------------

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return response.json();
}

type GroqListing = {
  data?: { id?: unknown; active?: unknown; context_window?: unknown }[];
};

async function listGroq(apiKey: string): Promise<RawModel[]> {
  const body = (await getJson('https://api.groq.com/openai/v1/models', {
    authorization: `Bearer ${apiKey}`,
  })) as GroqListing;

  return (body.data ?? []).flatMap((entry) => {
    if (typeof entry.id !== 'string' || entry.active === false) return [];
    if (!isGroqChatModel(entry.id)) return [];
    return [
      {
        provider: 'groq' as const,
        modelId: entry.id,
        contextTokens: typeof entry.context_window === 'number' ? entry.context_window : undefined,
      },
    ];
  });
}

type GoogleListing = {
  models?: {
    name?: unknown;
    displayName?: unknown;
    inputTokenLimit?: unknown;
    supportedGenerationMethods?: unknown;
  }[];
  nextPageToken?: unknown;
};

async function listGoogle(apiKey: string): Promise<RawModel[]> {
  const out: RawModel[] = [];
  let pageToken: string | undefined;

  // Paginated; three pages is far more than the chat line has ever needed.
  for (let page = 0; page < 3; page += 1) {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const body = (await getJson(url.toString(), { 'x-goog-api-key': apiKey })) as GoogleListing;

    for (const entry of body.models ?? []) {
      if (typeof entry.name !== 'string') continue;
      const id = entry.name.replace(/^models\//, '');
      const methods = Array.isArray(entry.supportedGenerationMethods)
        ? entry.supportedGenerationMethods
        : [];
      if (!methods.includes('generateContent') || !isGoogleChatModel(id)) continue;
      out.push({
        provider: 'google',
        modelId: id,
        displayName: typeof entry.displayName === 'string' ? entry.displayName : undefined,
        contextTokens:
          typeof entry.inputTokenLimit === 'number' ? entry.inputTokenLimit : undefined,
      });
    }

    if (typeof body.nextPageToken !== 'string' || body.nextPageToken.length === 0) break;
    pageToken = body.nextPageToken;
  }

  return out;
}

/** Catalog entries for the providers this deployment holds a key for. */
export function catalogModels(env: CannonEnv = readEnv()): ModelInfo[] {
  return MODELS.filter((model) => {
    if (model.provider === 'groq') return Boolean(env.groqApiKey);
    if (model.provider === 'google') return Boolean(env.googleApiKey);
    return false;
  });
}

let cache: { at: number; fingerprint: string; listing: ModelListing } | null = null;

/**
 * Every model this deployment can call right now, newest additions included.
 *
 * Cached in memory for an hour per key set. Each provider is fetched
 * independently, so one failing listing falls back to the catalog for that
 * provider alone.
 */
export async function listModels(env: CannonEnv = readEnv()): Promise<ModelListing> {
  const fingerprint = `${env.groqApiKey ? 'g' : '-'}${env.googleApiKey ? 'G' : '-'}`;
  if (cache && cache.fingerprint === fingerprint && Date.now() - cache.at < TTL_MS) {
    return cache.listing;
  }

  const tasks: [ProviderId, Promise<RawModel[]>][] = [];
  if (env.groqApiKey) tasks.push(['groq', listGroq(env.groqApiKey)]);
  if (env.googleApiKey) tasks.push(['google', listGoogle(env.googleApiKey)]);

  const settled = await Promise.allSettled(tasks.map(([, task]) => task));

  const raw: RawModel[] = [];
  const live: ProviderId[] = [];
  const sources: ModelListing['sources'] = {};

  settled.forEach((result, index) => {
    const provider = tasks[index][0];
    // An empty listing is treated as a failure: a key that can reach no chat
    // model at all is far likelier a filtering or API change than the truth.
    if (result.status === 'fulfilled' && result.value.length > 0) {
      raw.push(...result.value);
      live.push(provider);
      sources[provider] = 'live';
    } else {
      sources[provider] = 'catalog';
    }
  });

  const fallback = catalogModels(env).filter((model) => !live.includes(model.provider));
  const merged = mergeListing(raw, live);
  // Keep provider order stable: Groq first, then Google.
  const models = [...merged, ...fallback].sort(
    (a, b) => Number(a.provider === 'google') - Number(b.provider === 'google'),
  );

  const listing: ModelListing = { models, sources };
  // A total failure is not cached, so the next request tries again.
  if (live.length > 0 || tasks.length === 0) cache = { at: Date.now(), fingerprint, listing };
  return listing;
}

/** For tests. */
export function resetModelCache(): void {
  cache = null;
}
