// Unit tests for the orchestration layer's PURE logic — chunk combination, the reach-accuracy
// decision, partial-result building, and error normalization. These never call Meta or the
// endpoint layer; the async I/O orchestration functions (getOverview, getPosts, etc.) are instead
// validated by the real API smoke test (see the Prompt 6 report), consistent with the project's
// existing rule of not calling Meta from unit tests.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { GraphApiError } from "./client.ts";
import {
  apiErrorStatus,
  buildPartialResult,
  combineAccountChunks,
  shouldComputeAccuratePeriodReach,
  toApiError,
} from "./service.ts";
import type { InstagramAccountNormalized } from "./types.ts";

function makeAccount(overrides: Partial<InstagramAccountNormalized> = {}): InstagramAccountNormalized {
  return {
    id: "17841411481284458",
    username: "dabbleplayart",
    name: null,
    profilePictureUrl: null,
    followersCount: 53376,
    mediaCount: 2209,
    window: null,
    metrics: {
      profileViews: null,
      websiteClicks: null,
      views: null,
      accountsEngaged: null,
      totalInteractions: null,
      likes: null,
      comments: null,
      shares: null,
      saves: null,
      replies: null,
    },
    dailyMetrics: [],
    followsAndUnfollows: [],
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Period aggregation (combining multiple <=30-day chunks into one account)
// ----------------------------------------------------------------------------
describe("combineAccountChunks — period aggregation", () => {
  test("sums flow metrics (likes, comments, ...) across chunks", () => {
    const chunk1 = makeAccount({ metrics: { ...makeAccount().metrics, likes: 100, comments: 10, views: 500 } });
    const chunk2 = makeAccount({ metrics: { ...makeAccount().metrics, likes: 150, comments: 20, views: 700 } });

    const combined = combineAccountChunks([chunk1, chunk2], { since: "2026-06-01", until: "2026-07-31" });

    assert.equal(combined.metrics.likes, 250);
    assert.equal(combined.metrics.comments, 30);
    assert.equal(combined.metrics.views, 1200);
  });

  test("a null metric in ANY chunk makes the combined total null, not a partial sum", () => {
    const chunk1 = makeAccount({ metrics: { ...makeAccount().metrics, likes: 100 } });
    const chunk2 = makeAccount({ metrics: { ...makeAccount().metrics, likes: null } });

    const combined = combineAccountChunks([chunk1, chunk2], { since: "2026-06-01", until: "2026-07-31" });
    assert.equal(combined.metrics.likes, null);
  });

  test("profile fields (id, username, followersCount) come from the first chunk, not summed or averaged", () => {
    const chunk1 = makeAccount({ followersCount: 53376 });
    const chunk2 = makeAccount({ followersCount: 53376 }); // same account snapshot, as it always is per-chunk

    const combined = combineAccountChunks([chunk1, chunk2], { since: "2026-06-01", until: "2026-07-31" });
    assert.equal(combined.followersCount, 53376);
    assert.equal(combined.id, "17841411481284458");
  });

  test("dailyMetrics are concatenated across chunks, and de-duplicated by (metric, date) defensively", () => {
    const chunk1 = makeAccount({
      dailyMetrics: [
        { date: "2026-06-01", metric: "reach", value: 100 },
        { date: "2026-06-02", metric: "reach", value: 200 },
      ],
    });
    const chunk2 = makeAccount({
      dailyMetrics: [
        { date: "2026-06-02", metric: "reach", value: 999 }, // accidental duplicate of chunk1's last day
        { date: "2026-07-01", metric: "reach", value: 300 },
      ],
    });

    const combined = combineAccountChunks([chunk1, chunk2], { since: "2026-06-01", until: "2026-07-31" });
    assert.equal(combined.dailyMetrics.length, 3); // not 4 — the duplicate was dropped
    const dates = combined.dailyMetrics.map((m) => m.date);
    assert.deepEqual(dates, ["2026-06-01", "2026-06-02", "2026-07-01"]);
  });

  test("window is the ORIGINAL requested range, not any individual chunk's range", () => {
    const combined = combineAccountChunks([makeAccount(), makeAccount()], { since: "2026-06-01", until: "2026-07-31" });
    assert.deepEqual(combined.window, { since: "2026-06-01", until: "2026-07-31" });
  });
});

// ----------------------------------------------------------------------------
// Reach handling
// ----------------------------------------------------------------------------
describe("shouldComputeAccuratePeriodReach", () => {
  test("true when the range fit in a single chunk", () => {
    assert.equal(shouldComputeAccuratePeriodReach([{ since: "2026-08-01", until: "2026-08-16" }]), true);
  });

  test("false when the range needed multiple chunks — no summed approximation is used instead", () => {
    const chunks = [
      { since: "2026-06-01", until: "2026-06-30" },
      { since: "2026-07-01", until: "2026-07-31" },
    ];
    assert.equal(shouldComputeAccuratePeriodReach(chunks), false);
  });
});

// ----------------------------------------------------------------------------
// Follower semantics
// ----------------------------------------------------------------------------
describe("follower semantics in combineAccountChunks", () => {
  test("follows_and_unfollows sums per dimension across chunks (a legitimate flow metric)", () => {
    const chunk1 = makeAccount({
      followsAndUnfollows: [
        {
          metric: "follows_and_unfollows",
          breakdown: "follow_type",
          values: [
            { dimension: "FOLLOWER", value: 100 },
            { dimension: "NON_FOLLOWER", value: 20 },
          ],
        },
      ],
    });
    const chunk2 = makeAccount({
      followsAndUnfollows: [
        {
          metric: "follows_and_unfollows",
          breakdown: "follow_type",
          values: [
            { dimension: "FOLLOWER", value: 50 },
            { dimension: "NON_FOLLOWER", value: 10 },
          ],
        },
      ],
    });

    const combined = combineAccountChunks([chunk1, chunk2], { since: "2026-06-01", until: "2026-07-31" });
    const values = combined.followsAndUnfollows[0].values;
    assert.deepEqual(
      values.find((v) => v.dimension === "FOLLOWER"),
      { dimension: "FOLLOWER", value: 150 }
    );
    assert.deepEqual(
      values.find((v) => v.dimension === "NON_FOLLOWER"),
      { dimension: "NON_FOLLOWER", value: 30 }
    );
  });

  test("follower_count daily points are concatenated verbatim, never summed into a 'new followers' number", () => {
    const chunk1 = makeAccount({ dailyMetrics: [{ date: "2026-06-01", metric: "follower_count", value: 38 }] });
    const chunk2 = makeAccount({ dailyMetrics: [{ date: "2026-07-01", metric: "follower_count", value: 52 }] });

    const combined = combineAccountChunks([chunk1, chunk2], { since: "2026-06-01", until: "2026-07-31" });
    // Both raw points survive unmodified — the combiner never adds, averages, or reinterprets them.
    assert.deepEqual(
      combined.dailyMetrics.map((m) => m.value),
      [38, 52]
    );
  });
});

// ----------------------------------------------------------------------------
// Partial media failure / empty Stories
// ----------------------------------------------------------------------------
describe("buildPartialResult", () => {
  test("a failed item is reported in errors and excluded from data, without discarding successes", () => {
    const sources = ["media-1", "media-2", "media-3"];
    const settled: PromiseSettledResult<string>[] = [
      { status: "fulfilled", value: "normalized-1" },
      { status: "rejected", reason: new Error("insights fetch failed") },
      { status: "fulfilled", value: "normalized-3" },
    ];

    const result = buildPartialResult(sources, settled, (v) => `kpi(${v})`, (id) => id);

    assert.deepEqual(result.data, ["kpi(normalized-1)", "kpi(normalized-3)"]);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].id, "media-2");
    assert.match(result.errors[0].message, /insights fetch failed/);
  });

  test("an empty input list (e.g. zero currently-active Stories) yields empty data/warnings/errors, not an error", () => {
    const result = buildPartialResult<string, string, string>([], [], (v) => v, (id) => id);
    assert.deepEqual(result, { data: [], warnings: [], errors: [] });
  });

  test("extra warnings (e.g. a truncated media page) are carried through untouched", () => {
    const result = buildPartialResult<string, string, string>(
      [],
      [],
      (v) => v,
      (id) => id,
      ["media list was capped"]
    );
    assert.deepEqual(result.warnings, ["media list was capped"]);
  });
});

// ----------------------------------------------------------------------------
// API error normalization
// ----------------------------------------------------------------------------
describe("toApiError / apiErrorStatus", () => {
  test("a GraphApiError becomes a clean shape with no Meta-specific types leaking through as anything but plain fields", () => {
    const err = new GraphApiError("Invalid OAuth access token", 401, { type: "OAuthException", code: 190 });
    const shape = toApiError(err);
    assert.deepEqual(shape, { ok: false, error: "Invalid OAuth access token", metaErrorType: "OAuthException", metaErrorCode: 190 });
    assert.equal(apiErrorStatus(err), 401);
  });

  test("a GraphApiError with an out-of-range status normalizes to 502", () => {
    const err = new GraphApiError("weird", 999);
    assert.equal(apiErrorStatus(err), 502);
  });

  test("a generic Error is still normalized to the same shape, with no Meta fields fabricated", () => {
    const shape = toApiError(new Error("something else broke"));
    assert.deepEqual(shape, { ok: false, error: "something else broke", metaErrorType: null, metaErrorCode: null });
    assert.equal(apiErrorStatus(new Error("x")), 500);
  });

  test("a non-Error thrown value still produces a safe string, never a crash", () => {
    const shape = toApiError("a plain string throw");
    assert.equal(shape.ok, false);
    assert.equal(typeof shape.error, "string");
  });
});
