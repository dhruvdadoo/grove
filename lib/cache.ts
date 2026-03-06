/**
 * lib/cache.ts — In-memory TTL cache
 *
 * Uses a module-level Map so each serverless function instance keeps its own
 * cache in memory. Works correctly on Vercel (no filesystem writes needed).
 * Cache is warm for the lifetime of the function instance (~minutes).
 */

interface CacheEntry<T> {
  timestamp: number;
  value: T;
}

// Module-level map — persists for the lifetime of the serverless instance
const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string, ttlMs: number): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, { timestamp: Date.now(), value });
}
