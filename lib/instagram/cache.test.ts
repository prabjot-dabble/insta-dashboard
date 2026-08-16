import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { InstagramCache } from "./cache.ts";

// A controllable fake clock — cache tests never wait on real time.
function fakeClock(startMs = 0) {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("cache hit", () => {
  test("get() returns the value set for a key before it expires", () => {
    const clock = fakeClock();
    const cache = new InstagramCache(clock.now);
    cache.set("key1", { value: 42 }, 5000);
    assert.deepEqual(cache.get("key1"), { value: 42 });
  });
});

describe("cache miss", () => {
  test("get() returns undefined for a key that was never set", () => {
    const cache = new InstagramCache();
    assert.equal(cache.get("never-set"), undefined);
  });
});

describe("cache expiration", () => {
  test("get() returns undefined once the TTL has elapsed", () => {
    const clock = fakeClock();
    const cache = new InstagramCache(clock.now);
    cache.set("key1", "value", 1000);

    clock.advance(999);
    assert.equal(cache.get("key1"), "value");

    clock.advance(1); // now exactly at expiresAt
    assert.equal(cache.get("key1"), undefined);
  });

  test("an expired entry is removed from the store, not just hidden", () => {
    const clock = fakeClock();
    const cache = new InstagramCache(clock.now);
    cache.set("key1", "value", 1000);
    clock.advance(1000);
    cache.get("key1"); // triggers lazy eviction
    assert.equal(cache.size(), 0);
  });
});

describe("cache key separation", () => {
  test("different keys never collide, even with similar values", () => {
    const cache = new InstagramCache();
    cache.set("overview:acct1:2026-08-01:2026-08-16", "A", 5000);
    cache.set("overview:acct2:2026-08-01:2026-08-16", "B", 5000);
    cache.set("overview:acct1:2026-07-01:2026-07-31", "C", 5000);

    assert.equal(cache.get("overview:acct1:2026-08-01:2026-08-16"), "A");
    assert.equal(cache.get("overview:acct2:2026-08-01:2026-08-16"), "B");
    assert.equal(cache.get("overview:acct1:2026-07-01:2026-07-31"), "C");
  });

  test("invalidate() only clears the targeted key", () => {
    const cache = new InstagramCache();
    cache.set("a", 1, 5000);
    cache.set("b", 2, 5000);
    cache.invalidate("a");
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.get("b"), 2);
  });
});

describe("wrap() — cache-through behavior", () => {
  test("a cache miss calls compute() and caches the result", async () => {
    const cache = new InstagramCache();
    let calls = 0;
    const result = await cache.wrap("key1", 5000, async () => {
      calls += 1;
      return "computed";
    });
    assert.equal(result, "computed");
    assert.equal(calls, 1);
    assert.equal(cache.get("key1"), "computed");
  });

  test("a subsequent call within the TTL does not call compute() again", async () => {
    const clock = fakeClock();
    const cache = new InstagramCache(clock.now);
    let calls = 0;
    const compute = async () => {
      calls += 1;
      return calls;
    };

    await cache.wrap("key1", 5000, compute);
    clock.advance(1000);
    const second = await cache.wrap("key1", 5000, compute);

    assert.equal(second, 1);
    assert.equal(calls, 1);
  });

  test("concurrent calls for the same cold key coalesce into a single compute() call", async () => {
    const cache = new InstagramCache();
    let calls = 0;
    const compute = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return "value";
    };

    const [a, b, c] = await Promise.all([
      cache.wrap("key1", 5000, compute),
      cache.wrap("key1", 5000, compute),
      cache.wrap("key1", 5000, compute),
    ]);

    assert.equal(calls, 1);
    assert.equal(a, "value");
    assert.equal(b, "value");
    assert.equal(c, "value");
  });

  test("a failed compute() is not cached, and a later call retries it", async () => {
    const cache = new InstagramCache();
    let calls = 0;
    const compute = async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return "recovered";
    };

    await assert.rejects(() => cache.wrap("key1", 5000, compute), /boom/);
    const second = await cache.wrap("key1", 5000, compute);
    assert.equal(second, "recovered");
    assert.equal(calls, 2);
  });
});

describe("invalidateAll", () => {
  test("clears every key", () => {
    const cache = new InstagramCache();
    cache.set("a", 1, 5000);
    cache.set("b", 2, 5000);
    cache.invalidateAll();
    assert.equal(cache.size(), 0);
  });
});
