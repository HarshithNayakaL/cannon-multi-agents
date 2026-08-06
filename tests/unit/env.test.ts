import { describe, expect, it } from 'vitest';

import {
  describeCapabilities,
  hasDurableStorage,
  hasLiveInference,
  isOpenDemo,
  readEnv,
} from '@/lib/env';

describe('readEnv', () => {
  it('falls back to safe defaults when nothing is configured', () => {
    const env = readEnv({});
    expect(env.groqApiKey).toBeUndefined();
    expect(env.googleApiKey).toBeUndefined();
    expect(env.allowedEmails).toEqual([]);
    expect(env.rateLimitRequests).toBe(30);
    expect(env.rateLimitWindowSeconds).toBe(60);
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

  it('normalises the email allowlist', () => {
    const env = readEnv({ CANNON_ALLOWED_EMAILS: ' Me@Example.com , other@example.com ,, ' });
    expect(env.allowedEmails).toEqual(['me@example.com', 'other@example.com']);
  });

  it('ignores non-positive rate limit overrides', () => {
    expect(readEnv({ CANNON_RATE_LIMIT_REQUESTS: '0' }).rateLimitRequests).toBe(30);
    expect(readEnv({ CANNON_RATE_LIMIT_REQUESTS: 'nonsense' }).rateLimitRequests).toBe(30);
    expect(readEnv({ CANNON_RATE_LIMIT_REQUESTS: '12' }).rateLimitRequests).toBe(12);
  });
});

describe('capability detection', () => {
  it('reports simulated inference and memory storage with no secrets', () => {
    const capabilities = describeCapabilities(readEnv({}));
    expect(capabilities).toMatchObject({
      inference: 'simulated',
      storage: 'memory',
      embeddings: 'local',
      rateLimit: 'memory',
      demoMode: true,
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

  it('leaves open demo mode as soon as a passcode exists', () => {
    expect(isOpenDemo(readEnv({}))).toBe(true);
    expect(isOpenDemo(readEnv({ CANNON_AUTH_PASSCODE: 'hunter2' }))).toBe(false);
  });
});
