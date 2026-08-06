import { hasDurableStorage, readEnv } from '@/lib/env';
import { MemoryStore } from '@/lib/db/memory-store';
import { seedStore } from '@/lib/db/seed';
import { SupabaseStore } from '@/lib/db/supabase-store';
import type { CannonStore } from '@/lib/db/types';

type StoreCache = { store: CannonStore; ready: Promise<CannonStore> } | null;

// Module scope survives across requests on a warm lambda, so the demo store
// keeps its data for the life of the instance instead of reseeding per call.
let cache: StoreCache = null;

export async function getStore(): Promise<CannonStore> {
  if (cache) return cache.ready;

  const env = readEnv();

  if (hasDurableStorage(env)) {
    const store = new SupabaseStore(env.supabaseUrl!, env.supabaseServiceKey!);
    cache = { store, ready: Promise.resolve(store) };
    return store;
  }

  const store = new MemoryStore();
  const ready = seedStore(store).then(() => store);
  cache = { store, ready };
  return ready;
}

/** Test helper — drops the cached instance so the next call rebuilds it. */
export function resetStoreCache(): void {
  cache = null;
}

export type { CannonStore };
