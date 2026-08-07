import { hasDurableStorage, readEnv } from '@/lib/env';
import { MemoryStore } from '@/lib/db/memory-store';
import { seedStore } from '@/lib/db/seed';
import { SupabaseStore } from '@/lib/db/supabase-store';
import type { CannonStore } from '@/lib/db/types';

type StoreCache = { store: CannonStore; ready: Promise<CannonStore> } | null;

/**
 * The cache is pinned to `globalThis`, not to module scope.
 *
 * Next bundles route handlers and server components separately, so a
 * module-level `let` gives each bundle its own copy. That is invisible with
 * Supabase — every copy talks to the same Postgres — but with the memory
 * store it means the agent you just created through `/api/agents` does not
 * exist as far as the page rendering `/[agent]` is concerned, and the route
 * 404s on something that was written a second ago.
 *
 * `globalThis` is one object per process, so every bundle shares an instance.
 * It also survives dev-server hot reloads, which module scope does not.
 *
 * This does not make the memory store durable. Separate lambdas are separate
 * processes, and nothing here changes that — it is why Supabase is the real
 * answer for anything you want to keep.
 */
const CACHE_KEY = Symbol.for('cannon.store');

type GlobalWithStore = typeof globalThis & { [CACHE_KEY]?: StoreCache };

function readCache(): StoreCache {
  return (globalThis as GlobalWithStore)[CACHE_KEY] ?? null;
}

function writeCache(value: StoreCache): void {
  (globalThis as GlobalWithStore)[CACHE_KEY] = value;
}

export async function getStore(): Promise<CannonStore> {
  const cached = readCache();
  if (cached) return cached.ready;

  const env = readEnv();

  if (hasDurableStorage(env)) {
    const store = new SupabaseStore(env.supabaseUrl!, env.supabaseServiceKey!);
    writeCache({ store, ready: Promise.resolve(store) });
    return store;
  }

  const store = new MemoryStore();
  const ready = seedStore(store).then(() => store);
  writeCache({ store, ready });
  return ready;
}

/** Test helper — drops the cached instance so the next call rebuilds it. */
export function resetStoreCache(): void {
  writeCache(null);
}

export type { CannonStore };
