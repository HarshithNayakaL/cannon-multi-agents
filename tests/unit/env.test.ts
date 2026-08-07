import { describe, expect, it } from 'vitest';

import { describeCapabilities, hasDurableStorage, hasLiveInference, readEnv } from '@/lib/env';

describe('readEnv', () => {
  it('falls back to safe defaults when nothing is configured', () => {
    const env = readEnv({});
    expect(env.groqApiKey).toBeUndefined();
    expect(env.googleApiKey).toBeUndefined();
  });

  it('treats blank strings as unset so a stray empty var cannot half-enable a provider', () => {
    const env = readEnv({ GROQ_API_KEY: '   ', SUPABASE_URL: '' });
    expect(env.groqApiKey).toBeUndefined();
    expect(env.supabaseUrl).toBeUndefined();
  });

  it('accepts either Gemini key name', () => {
    expect(readEnv({ GEMINI_API_KEY: 'a' }).googleApiKey).toBe('a');
    expect(readEnv({ GOOGLE_GENERATIVE_AI_API_KEY: 'b' }).googleApiKey).toBe('b');
  });

  it('strips a trailing slash off the Supabase URL', () => {
    // A pasted trailing slash produces `//rest/v1/...` and the Supabase
    // gateway rejects the request outright.
    expect(readEnv({ SUPABASE_URL: 'https://x.supabase.co/' }).supabaseUrl).toBe(
      'https://x.supabase.co',
    );
    expect(readEnv({ SUPABASE_URL: 'https://x.supabase.co///' }).supabaseUrl).toBe(
      'https://x.supabase.co',
    );
    expect(readEnv({ SUPABASE_URL: '  https://x.supabase.co/  ' }).supabaseUrl).toBe(
      'https://x.supabase.co',
    );
  });

  it('leaves a correctly formed Supabase URL alone', () => {
    expect(readEnv({ SUPABASE_URL: 'https://x.supabase.co' }).supabaseUrl).toBe(
      'https://x.supabase.co',
    );
  });
});

describe('capability detection', () => {
  it('reports simulated inference and memory storage with no secrets', () => {
    const capabilities = describeCapabilities(readEnv({}));
    expect(capabilities).toMatchObject({
      inference: 'simulated',
      storage: 'memory',
      embeddings: 'local',
    });
  });

  it('prefers Groq for inference when both providers are configured', () => {
    const env = readEnv({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'k' });
    expect(describeCapabilities(env).inference).toBe('groq');
    expect(hasLiveInference(env)).toBe(true);
  });

  it('requires both Supabase values before claiming durable storage', () => {
    expect(hasDurableStorage(readEnv({ SUPABASE_URL: 'https://x.supabase.co' }))).toBe(false);
    expect(
      hasDurableStorage(
        readEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }),
      ),
    ).toBe(true);
  });
});
