import { afterEach, describe, expect, it, vi } from 'vitest';

import { MODELS } from '@/lib/ai/catalog';
import {
  inferTraits,
  isGoogleChatModel,
  isGroqChatModel,
  listModels,
  mergeListing,
  prettyModelName,
  resetModelCache,
} from '@/lib/ai/live-models';
import { resolveModel } from '@/lib/ai/provider';
import { readEnv } from '@/lib/env';

describe('filtering provider listings down to chat models', () => {
  it('drops Groq speech, safety and TTS models', () => {
    expect(isGroqChatModel('llama-3.3-70b-versatile')).toBe(true);
    expect(isGroqChatModel('qwen/qwen3.8-27b')).toBe(true);
    for (const id of [
      'whisper-large-v3',
      'canopylabs/orpheus-v1-english',
      'meta-llama/llama-prompt-guard-2-86m',
      'openai/gpt-oss-safeguard-20b',
    ]) {
      expect(isGroqChatModel(id), id).toBe(false);
    }
  });

  it('keeps base Gemini ids and drops embeddings, images and pinned aliases', () => {
    expect(isGoogleChatModel('gemini-3.6-flash')).toBe(true);
    for (const id of [
      'gemini-embedding-001',
      'gemini-3.6-flash-001',
      'gemini-flash-latest',
      'gemini-3.6-flash-image',
      'imagen-4.0-generate',
      'gemma-3-27b-it',
    ]) {
      expect(isGoogleChatModel(id), id).toBe(false);
    }
  });
});

describe('merging a live listing with the catalog', () => {
  it('keeps catalog notes for listed models, drops unlisted ones, and adds new ones', () => {
    const merged = mergeListing(
      [
        { provider: 'groq', modelId: 'llama-3.3-70b-versatile', contextTokens: 131_072 },
        { provider: 'groq', modelId: 'acme/brand-new-70b', contextTokens: 262_144 },
      ],
      ['groq'],
    );

    const keys = merged.map((model) => model.key);
    expect(keys).toEqual(['groq:llama-3.3-70b-versatile', 'groq:acme/brand-new-70b']);

    const known = merged[0];
    expect(known.isNew).toBeUndefined();
    expect(known.speed).toBe(280);

    const fresh = merged[1];
    expect(fresh.isNew).toBe(true);
    expect(fresh.name).toBe('Brand New 70B');
    expect(fresh.contextTokens).toBe(262_144);
    // Every catalog Groq model the listing omitted is gone.
    expect(keys).not.toContain('groq:openai/gpt-oss-20b');
  });

  it('leaves providers that were not listed live to the caller', () => {
    const merged = mergeListing([], ['groq']);
    expect(merged).toEqual([]);
    expect(merged.some((model) => model.provider === 'google')).toBe(false);
  });

  it('names and characterises models it has never seen', () => {
    expect(prettyModelName('qwen/qwen3.8-27b')).toBe('Qwen3.8 27B');
    expect(prettyModelName('gemini-3.7-pro')).toBe('Gemini 3.7 Pro');
    expect(inferTraits('gemini-3.7-flash-lite', 1_048_576)).toEqual(
      expect.arrayContaining(['fastest', 'long-context']),
    );
    expect(inferTraits('vendor/thinker-120b', 131_072)).toContain('reasoning');
  });
});

describe('the catalog', () => {
  it('carries Qwen3.8 and no longer offers models Groq retired', () => {
    const keys = MODELS.map((model) => model.key);
    expect(keys).toContain('groq:qwen/qwen3.8-27b');
    expect(keys).not.toContain('groq:qwen/qwen3-32b');
    expect(keys).not.toContain('groq:moonshotai/kimi-k2-instruct-0905');
  });
});

describe('fetching the live list', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetModelCache();
  });

  const env = readEnv({ GROQ_API_KEY: 'test-key' });

  it('uses the provider listing when it answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: [
            { id: 'llama-3.3-70b-versatile', active: true, context_window: 131072 },
            { id: 'qwen/qwen3.8-27b', active: true, context_window: 131072 },
            { id: 'vendor/fresh-model', active: true, context_window: 65536 },
            { id: 'whisper-large-v3', active: true },
            { id: 'retired-model', active: false },
          ],
        }),
      ),
    );

    const listing = await listModels(env);
    expect(listing.sources).toEqual({ groq: 'live' });
    expect(listing.models.map((model) => model.modelId)).toEqual([
      'llama-3.3-70b-versatile',
      'qwen/qwen3.8-27b',
      'vendor/fresh-model',
    ]);
  });

  it('falls back to the catalog when the listing fails, and retries next time', async () => {
    const failing = vi.fn(async () => new Response('down', { status: 503 }));
    vi.stubGlobal('fetch', failing);

    const listing = await listModels(env);
    expect(listing.sources).toEqual({ groq: 'catalog' });
    expect(listing.models.length).toBeGreaterThan(0);
    expect(listing.models.every((model) => model.provider === 'groq')).toBe(true);

    await listModels(env);
    expect(failing).toHaveBeenCalledTimes(2);
  });
});

describe('resolving against the live list', () => {
  const env = { GROQ_API_KEY: 'test-key', CANNON_GROQ_MODEL: 'retired-model' };

  it('honours a pin on a newly listed model and replaces a retired default', () => {
    vi.stubEnv('GROQ_API_KEY', env.GROQ_API_KEY);
    vi.stubEnv('CANNON_GROQ_MODEL', env.CANNON_GROQ_MODEL);
    try {
      const listed = mergeListing(
        [
          { provider: 'groq', modelId: 'llama-3.3-70b-versatile' },
          { provider: 'groq', modelId: 'vendor/fresh-model' },
        ],
        ['groq'],
      );
      const { chain } = resolveModel('fitness', undefined, 'groq:vendor/fresh-model', listed);
      expect(chain).toEqual(['groq:vendor/fresh-model', 'groq:llama-3.3-70b-versatile']);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
