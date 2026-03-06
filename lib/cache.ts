/**
 * lib/cache.ts — Simple file-based cache with TTL
 * Stores JSON blobs in .grove-cache/ inside the project root.
 * Falls back gracefully on any FS error.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(process.cwd(), ".grove-cache");

function ensureDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/** Sanitise an arbitrary cache key into a safe filename */
function sanitise(key: string): string {
  return key.replace(/[^a-z0-9_-]/gi, "_").slice(0, 120);
}

interface CacheEntry<T> {
  timestamp: number;
  value: T;
}

export function getCached<T>(key: string, ttlMs: number): T | null {
  try {
    ensureDir();
    const filepath = join(CACHE_DIR, `${sanitise(key)}.json`);
    if (!existsSync(filepath)) return null;

    const entry = JSON.parse(readFileSync(filepath, "utf-8")) as CacheEntry<T>;
    if (Date.now() - entry.timestamp > ttlMs) return null;
    return entry.value;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, value: T): void {
  try {
    ensureDir();
    const filepath = join(CACHE_DIR, `${sanitise(key)}.json`);
    const entry: CacheEntry<T> = { timestamp: Date.now(), value };
    writeFileSync(filepath, JSON.stringify(entry), "utf-8");
  } catch (err) {
    console.error("[cache] write failed:", err);
  }
}
