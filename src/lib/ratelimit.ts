import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { readEnv } from '@/lib/env';

export type RateLimitVerdict = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms at which the current window resets. */
  reset: number;
  backend: 'upstash' | 'memory';
};

type Window = { count: number; reset: number };

/**
 * Sliding-window counter used when Upstash is not configured.
 *
 * Per-instance rather than global, which is the honest trade for a free-tier
 * demo: it still protects a single warm lambda from a runaway client.
 */
export class MemoryRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitVerdict {
    const timestamp = this.now();
    const existing = this.windows.get(key);

    if (!existing || existing.reset <= timestamp) {
      const window: Window = { count: 1, reset: timestamp + this.windowMs };
      this.windows.set(key, window);
      return {
        success: true,
        limit: this.limit,
        remaining: this.limit - 1,
        reset: window.reset,
        backend: 'memory',
      };
    }

    existing.count += 1;
    const remaining = Math.max(0, this.limit - existing.count);
    return {
      success: existing.count <= this.limit,
      limit: this.limit,
      remaining,
      reset: existing.reset,
      backend: 'memory',
    };
  }
}

let upstash: Ratelimit | null = null;
let memory: MemoryRateLimiter | null = null;

export async function enforceRateLimit(key: string): Promise<RateLimitVerdict> {
  const env = readEnv();

  if (env.upstashUrl && env.upstashToken) {
    upstash ??= new Ratelimit({
      redis: new Redis({ url: env.upstashUrl, token: env.upstashToken }),
      limiter: Ratelimit.slidingWindow(env.rateLimitRequests, `${env.rateLimitWindowSeconds} s`),
      prefix: 'cannon',
      analytics: false,
    });
    try {
      const result = await upstash.limit(key);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset,
        backend: 'upstash',
      };
    } catch {
      // Redis being down must not take the assistant down with it.
    }
  }

  memory ??= new MemoryRateLimiter(env.rateLimitRequests, env.rateLimitWindowSeconds * 1000);
  return memory.check(key);
}

/** Test helper — clears the cached limiter instances. */
export function resetRateLimiters(): void {
  upstash = null;
  memory = null;
}
