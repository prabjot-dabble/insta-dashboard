// Lightweight in-memory TTL cache for the orchestration layer. Deliberately just a Map — no
// database, no Redis, no external cache service.
//
// Purpose: a CEO refreshing the dashboard (or the same page loading its 6 API routes back to
// back) should not trigger a fresh burst of Meta API calls every time. A short TTL absorbs that
// without ever serving genuinely stale data for long.
//
// LIFETIME: this cache lives only in process memory. It resets completely on every deploy and
// every server restart — there is nothing to invalidate externally, nothing persisted, nothing
// shared across instances. That's a deliberate consequence of "no database", not an oversight.
//
// SERIALIZATION: values are held by reference in the Map, never serialized to a string or written
// anywhere — so there is no serialization step to make "safe". If this cache were ever backed by
// something that required serialization (it isn't, by design), JSON-safety would need revisiting.
//
// TOKEN SAFETY: this module has no knowledge of META_ACCESS_TOKEN or any credential — it only
// ever stores whatever value a caller passes to `wrap()`. In this codebase that's always an
// already-normalized/KPI-shaped response object built by service.ts, never a raw fetch option or
// credential. That's enforced by how the service layer uses this cache, not by this file itself.

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class InstagramCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly now: () => number;

  /** `now` is injectable so tests can control expiry deterministically without real timers. */
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidateAll(): void {
    this.store.clear();
  }

  /** Number of live (not necessarily unexpired) entries — mainly for tests/diagnostics. */
  size(): number {
    return this.store.size;
  }

  /**
   * Cache-through helper: returns the cached value for `key` if present and unexpired; otherwise
   * calls `compute()`, caches the result for `ttlMs`, and returns it.
   *
   * `forceRefresh` (default false) invalidates `key` before doing anything else, so a stale-but-
   * unexpired entry can't short-circuit a caller that explicitly wants fresh data. It does NOT
   * touch in-flight coalescing below: if a compute() for this key is already in progress (from a
   * concurrent non-forced call), a forced call still joins that same in-flight promise rather than
   * starting a second redundant one — invalidating only ever affects the STORE, never `inFlight`.
   *
   * Concurrent calls for the SAME key that both miss the cache share the same in-flight promise
   * rather than triggering two duplicate Meta requests (request coalescing) — this matters
   * specifically because several service.ts functions (e.g. getPosts/getCarousels/getReels) can
   * be invoked together for one dashboard load and would otherwise race each other on a cold
   * cache.
   */
  async wrap<T>(key: string, ttlMs: number, compute: () => Promise<T>, forceRefresh: boolean = false): Promise<T> {
    if (forceRefresh) {
      this.invalidate(key);
    }

    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = compute()
      .then((value) => {
        this.set(key, value, ttlMs);
        this.inFlight.delete(key);
        return value;
      })
      .catch((err) => {
        this.inFlight.delete(key);
        throw err;
      });

    this.inFlight.set(key, promise);
    return promise;
  }
}

/** Shared instance used by service.ts in production — a real wall clock. */
export const instagramCache = new InstagramCache();

/**
 * TTLs, in milliseconds. 5 minutes for overview/media data balances "the CEO sees fresh-enough
 * numbers" against "don't refetch on every click". Stories get a shorter TTL since they're
 * inherently short-lived content — a stale cache entry is more likely to describe a story that
 * has since expired. Trend/MoM data (multi-chunk, the most expensive requests to recompute)
 * get a longer TTL since the underlying numbers change slowly.
 */
export const CACHE_TTL_MS = {
  overview: 5 * 60 * 1000,
  media: 5 * 60 * 1000,
  stories: 2 * 60 * 1000,
  trend: 15 * 60 * 1000,
  mom: 15 * 60 * 1000,
} as const;
