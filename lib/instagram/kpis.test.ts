// Unit tests for the deterministic KPI engine. Every test uses hand-built, deterministic fixtures
// — no Meta calls, no normalize.ts fixtures reused verbatim (those belong to normalize.test.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  absoluteChange,
  accountEngagementRate,
  bestCarousel,
  bestReel,
  bestStory,
  buildAccountOverviewKpis,
  buildContentKpi,
  buildStoryKpi,
  buildTrendSeries,
  followerChange,
  followerGrowthPercent,
  getFollowerCountDailySeries,
  latestValue,
  lowestCarousel,
  lowestReel,
  lowestStory,
  mediaEngagementRate,
  percentageChange,
  periodAverage,
  periodTotal,
  roundToPrecision,
  summarizeFollowsAndUnfollows,
  type ContentKpi,
  type StoryKpi,
} from "./kpis.ts";
import type {
  InstagramAccountNormalized,
  InstagramBreakdownMetric,
  InstagramCarouselNormalized,
  InstagramDailyMetric,
  InstagramMediaMetrics,
  InstagramReelMetrics,
  InstagramReelNormalized,
  InstagramStoryNormalized,
} from "./types.ts";

// ----------------------------------------------------------------------------
// Fixture builders
// ----------------------------------------------------------------------------

function mediaMetrics(overrides: Partial<InstagramMediaMetrics> = {}): InstagramMediaMetrics {
  return {
    reach: null,
    views: null,
    likes: null,
    comments: null,
    shares: null,
    saved: null,
    totalInteractions: null,
    ...overrides,
  };
}

function makeReel(id: string, metrics: Partial<InstagramMediaMetrics>, reelMetrics: Partial<InstagramReelMetrics> = {}): InstagramReelNormalized {
  return {
    id,
    caption: null,
    mediaType: "VIDEO",
    mediaProductType: "REELS",
    timestamp: "2026-08-01T00:00:00+0000",
    permalink: null,
    mediaUrl: null,
    thumbnailUrl: null,
    username: null,
    contentType: "REEL",
    metrics: mediaMetrics(metrics),
    reelMetrics: { averageWatchTime: null, totalVideoViewTime: null, skipRate: null, ...reelMetrics },
  };
}

function makeCarousel(id: string, metrics: Partial<InstagramMediaMetrics>): InstagramCarouselNormalized {
  return {
    id,
    caption: null,
    mediaType: "CAROUSEL_ALBUM",
    mediaProductType: "FEED",
    timestamp: "2026-08-01T00:00:00+0000",
    permalink: null,
    mediaUrl: null,
    thumbnailUrl: null,
    username: null,
    contentType: "CAROUSEL",
    metrics: mediaMetrics(metrics),
  };
}

function makeStory(id: string, metrics: Partial<InstagramStoryNormalized["metrics"]>): InstagramStoryNormalized {
  return {
    id,
    mediaType: "VIDEO",
    timestamp: "2026-08-01T00:00:00+0000",
    permalink: null,
    mediaUrl: null,
    thumbnailUrl: null,
    metrics: { views: null, reach: null, replies: null, follows: null, profileVisits: null, navigation: null, ...metrics },
  };
}

function makeAccount(overrides: Partial<InstagramAccountNormalized> = {}): InstagramAccountNormalized {
  return {
    id: "acct1",
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
// 1. Engagement rate (account-level)
// ----------------------------------------------------------------------------
describe("accountEngagementRate", () => {
  test("(likes+comments+shares+saves)/reach x 100", () => {
    const result = accountEngagementRate({ likes: 10, comments: 5, shares: 3, saves: 2 }, 100);
    assert.equal(result, 20);
  });
});

// ----------------------------------------------------------------------------
// 2. Zero reach
// ----------------------------------------------------------------------------
describe("accountEngagementRate — zero reach", () => {
  test("returns null, never Infinity", () => {
    const result = accountEngagementRate({ likes: 10, comments: 5, shares: 3, saves: 2 }, 0);
    assert.equal(result, null);
  });
});

// ----------------------------------------------------------------------------
// 3. Null reach
// ----------------------------------------------------------------------------
describe("accountEngagementRate — null reach", () => {
  test("returns null", () => {
    const result = accountEngagementRate({ likes: 10, comments: 5, shares: 3, saves: 2 }, null);
    assert.equal(result, null);
  });
});

// ----------------------------------------------------------------------------
// 4. Media engagement rate
// ----------------------------------------------------------------------------
describe("mediaEngagementRate", () => {
  test("(likes+comments+shares+saved)/reach x 100, using media-level `saved`", () => {
    const result = mediaEngagementRate(mediaMetrics({ likes: 5, comments: 2, shares: 1, saved: 2, reach: 100 }));
    assert.equal(result, 10);
  });

  test("null reach yields null", () => {
    const result = mediaEngagementRate(mediaMetrics({ likes: 5, comments: 2, shares: 1, saved: 2, reach: null }));
    assert.equal(result, null);
  });
});

// ----------------------------------------------------------------------------
// 5. MoM absolute change
// ----------------------------------------------------------------------------
describe("absoluteChange", () => {
  test("current - previous", () => {
    assert.equal(absoluteChange(150, 100), 50);
  });
});

// ----------------------------------------------------------------------------
// 6. MoM percentage change
// ----------------------------------------------------------------------------
describe("percentageChange", () => {
  test("(current-previous)/previous x 100", () => {
    assert.equal(percentageChange(150, 100), 50);
  });
});

// ----------------------------------------------------------------------------
// 7. Previous period zero
// ----------------------------------------------------------------------------
describe("previous = 0", () => {
  test("percentageChange returns null (never Infinity), even when current is also 0", () => {
    assert.equal(percentageChange(50, 0), null);
    assert.equal(percentageChange(0, 0), null);
  });

  test("absoluteChange is still a well-defined number when previous is 0", () => {
    assert.equal(absoluteChange(50, 0), 50);
  });
});

// ----------------------------------------------------------------------------
// 8. Current period zero
// ----------------------------------------------------------------------------
describe("current = 0", () => {
  test("percentageChange and absoluteChange both compute normally (a real decline to zero)", () => {
    assert.equal(absoluteChange(0, 100), -100);
    assert.equal(percentageChange(0, 100), -100);
  });
});

// ----------------------------------------------------------------------------
// 9. Follower change
// ----------------------------------------------------------------------------
describe("followerChange", () => {
  test("difference between two followers_count snapshots", () => {
    assert.equal(followerChange(1000, 950), 50);
  });

  test("null snapshot yields null", () => {
    assert.equal(followerChange(1000, null), null);
  });
});

// ----------------------------------------------------------------------------
// 10. Follower growth %
// ----------------------------------------------------------------------------
describe("followerGrowthPercent", () => {
  test("matches percentageChange semantics", () => {
    const result = followerGrowthPercent(1000, 950);
    assert.ok(result !== null);
    assert.ok(Math.abs((result as number) - 5.2631578947) < 1e-6);
  });

  test("zero previous followers returns null, not Infinity", () => {
    assert.equal(followerGrowthPercent(100, 0), null);
  });
});

// ----------------------------------------------------------------------------
// 11 & 12. Best / lowest Reel
// ----------------------------------------------------------------------------
describe("bestReel / lowestReel", () => {
  const reels: ContentKpi[] = [
    buildContentKpi(makeReel("r1", { likes: 10, comments: 0, shares: 0, saved: 0, reach: 100 })), // 10%
    buildContentKpi(makeReel("r2", { likes: 50, comments: 0, shares: 0, saved: 0, reach: 100 })), // 50%
    buildContentKpi(makeReel("r3", { likes: 2, comments: 0, shares: 0, saved: 0, reach: 100 })), // 2%
  ];

  test("best Reel has the highest engagement rate", () => {
    assert.equal(bestReel(reels)?.id, "r2");
  });

  test("lowest Reel has the lowest engagement rate", () => {
    assert.equal(lowestReel(reels)?.id, "r3");
  });
});

// ----------------------------------------------------------------------------
// 13 & 14. Best / lowest Carousel
// ----------------------------------------------------------------------------
describe("bestCarousel / lowestCarousel", () => {
  const carousels: ContentKpi[] = [
    buildContentKpi(makeCarousel("c1", { likes: 20, comments: 0, shares: 0, saved: 0, reach: 200 })), // 10%
    buildContentKpi(makeCarousel("c2", { likes: 80, comments: 0, shares: 0, saved: 0, reach: 200 })), // 40%
  ];

  test("best Carousel has the highest engagement rate", () => {
    assert.equal(bestCarousel(carousels)?.id, "c2");
  });

  test("lowest Carousel has the lowest engagement rate", () => {
    assert.equal(lowestCarousel(carousels)?.id, "c1");
  });

  test("a Reel in the same list is never picked for bestCarousel (content-type filtered)", () => {
    const mixed: ContentKpi[] = [...carousels, buildContentKpi(makeReel("r-huge", { likes: 1000, comments: 0, shares: 0, saved: 0, reach: 100 }))];
    assert.equal(bestCarousel(mixed)?.id, "c2");
  });
});

// ----------------------------------------------------------------------------
// 15. Tie-breaking using reach
// ----------------------------------------------------------------------------
describe("tie-breaking", () => {
  test("equal engagement rate resolves by higher reach for best, lower reach for lowest", () => {
    const items: ContentKpi[] = [
      buildContentKpi(makeReel("low-reach", { likes: 10, comments: 0, shares: 0, saved: 0, reach: 100 })), // 10%, reach 100
      buildContentKpi(makeReel("high-reach", { likes: 50, comments: 0, shares: 0, saved: 0, reach: 500 })), // 10%, reach 500
    ];
    assert.equal(bestReel(items)?.id, "high-reach");
    assert.equal(lowestReel(items)?.id, "low-reach");
  });
});

// ----------------------------------------------------------------------------
// 16. Null metrics excluded from ranking
// ----------------------------------------------------------------------------
describe("null engagement rate excluded from ranking", () => {
  test("an item with unavailable reach (null engagementRate) never wins best or lowest", () => {
    const items: ContentKpi[] = [
      buildContentKpi(makeReel("no-data", { likes: 5, comments: 0, shares: 0, saved: 0, reach: null })), // engagementRate null
      buildContentKpi(makeReel("real", { likes: 1, comments: 0, shares: 0, saved: 0, reach: 1000 })), // 0.1%
    ];
    assert.equal(bestReel(items)?.id, "real");
    assert.equal(lowestReel(items)?.id, "real");
  });

  test("if every item has null engagementRate, best/lowest return null rather than picking arbitrarily", () => {
    const items: ContentKpi[] = [buildContentKpi(makeReel("a", { reach: null })), buildContentKpi(makeReel("b", { reach: null }))];
    assert.equal(bestReel(items), null);
    assert.equal(lowestReel(items), null);
  });
});

// ----------------------------------------------------------------------------
// 17. Story ranking
// ----------------------------------------------------------------------------
describe("bestStory / lowestStory", () => {
  const stories: StoryKpi[] = [
    buildStoryKpi(makeStory("s1", { views: 50, reach: 40 })),
    buildStoryKpi(makeStory("s2", { views: 200, reach: 150 })),
  ];

  test("best Story ranks by reach (engagement rate is not computable for Stories)", () => {
    assert.equal(bestStory(stories)?.id, "s2");
  });

  test("lowest Story ranks by reach", () => {
    assert.equal(lowestStory(stories)?.id, "s1");
  });
});

// ----------------------------------------------------------------------------
// 18. Story empty dataset
// ----------------------------------------------------------------------------
describe("Story ranking — empty dataset", () => {
  test("bestStory/lowestStory return null for an empty list, not a crash", () => {
    assert.equal(bestStory([]), null);
    assert.equal(lowestStory([]), null);
  });
});

// ----------------------------------------------------------------------------
// 19. Account KPI aggregation
// ----------------------------------------------------------------------------
describe("buildAccountOverviewKpis", () => {
  test("assembles the overview object using the caller-supplied periodReach, and the explicit engagement-rate sum", () => {
    // Prompt 6 correction: reach is no longer derived from dailyMetrics inside this function — it
    // must be an accurate, already-obtained number (e.g. from getAccountReachTotal via the
    // orchestration layer) passed in directly. See the function's docstring.
    const account = makeAccount({
      metrics: {
        profileViews: 100,
        websiteClicks: 20,
        views: 5000,
        accountsEngaged: 300,
        totalInteractions: 900, // deliberately NOT equal to likes+comments+shares+saves below
        likes: 400,
        comments: 50,
        shares: 30,
        saves: 20,
        replies: 5,
      },
    });

    const result = buildAccountOverviewKpis(account, 2500);

    assert.equal(result.followers, 53376);
    assert.equal(result.reach, 2500); // passed through verbatim, not recomputed
    assert.equal(result.views, 5000);
    assert.equal(result.totalInteractions, 900); // pass-through of Meta's own field, unmodified
    // engagementRate uses the LOCAL sum (400+50+30+20=500), not Meta's totalInteractions (900)
    assert.equal(result.engagementRate, (500 / 2500) * 100);
  });

  test("periodReach: null (e.g. period exceeded 30 days, or Meta's total_value call failed) yields reach: null and engagementRate: null, not 0", () => {
    const account = makeAccount({ metrics: { ...makeAccount().metrics, likes: 10, comments: 1, shares: 1, saves: 1 } });
    const result = buildAccountOverviewKpis(account, null);
    assert.equal(result.reach, null);
    assert.equal(result.engagementRate, null);
  });
});

// ----------------------------------------------------------------------------
// 20. Three-month trend
// ----------------------------------------------------------------------------
describe("buildTrendSeries", () => {
  test("produces one {period, value} per input period, in order, for an arbitrary metric extractor", () => {
    const periods = [
      { period: "2026-06", data: makeAccount({ metrics: { ...makeAccount().metrics, likes: 100 } }) },
      { period: "2026-07", data: makeAccount({ metrics: { ...makeAccount().metrics, likes: 150 } }) },
      { period: "2026-08", data: makeAccount({ metrics: { ...makeAccount().metrics, likes: 200 } }) },
    ];

    const trend = buildTrendSeries(periods, (a) => a.metrics.likes);
    assert.deepEqual(trend, [
      { period: "2026-06", value: 100 },
      { period: "2026-07", value: 150 },
      { period: "2026-08", value: 200 },
    ]);
  });

  test("works for any number of periods, not just three", () => {
    const periods = [{ period: "only-one", data: makeAccount({ metrics: { ...makeAccount().metrics, likes: 5 } }) }];
    assert.equal(buildTrendSeries(periods, (a) => a.metrics.likes).length, 1);
  });
});

// ----------------------------------------------------------------------------
// 21. Null vs zero handling
// ----------------------------------------------------------------------------
describe("null vs zero", () => {
  test("a real zero in one interaction component still sums correctly (0 is not excluded like null is)", () => {
    const result = accountEngagementRate({ likes: 10, comments: 0, shares: 0, saves: 0 }, 100);
    assert.equal(result, 10); // (10+0+0+0)/100*100
  });

  test("a null interaction component makes the whole numerator null, unlike a zero component", () => {
    const result = accountEngagementRate({ likes: 10, comments: null, shares: 0, saves: 0 }, 100);
    assert.equal(result, null);
  });

  test("periodTotal distinguishes 'no data points' (null) from 'data points summing to zero' (0)", () => {
    assert.equal(periodTotal([], "reach"), null);
    const zeroDay: InstagramDailyMetric[] = [{ date: "2026-08-01", metric: "reach", value: 0 }];
    assert.equal(periodTotal(zeroDay, "reach"), 0);
  });
});

// ----------------------------------------------------------------------------
// 22. Reel-specific KPIs
// ----------------------------------------------------------------------------
describe("Reel-specific KPIs", () => {
  test("buildContentKpi populates reelMetrics for a Reel", () => {
    const reel = makeReel(
      "r1",
      { likes: 10, reach: 100 },
      { averageWatchTime: 7568, totalVideoViewTime: 23938309, skipRate: 59.1 }
    );
    const kpi = buildContentKpi(reel);
    assert.deepEqual(kpi.reelMetrics, { averageWatchTime: 7568, totalVideoViewTime: 23938309, skipRate: 59.1 });
  });

  test("buildContentKpi never populates reelMetrics for a non-Reel", () => {
    const carousel = makeCarousel("c1", { likes: 10, reach: 100 });
    const kpi = buildContentKpi(carousel);
    assert.equal(kpi.reelMetrics, null);
  });
});

// ----------------------------------------------------------------------------
// Bonus coverage
// ----------------------------------------------------------------------------
describe("follows_and_unfollows breakdown", () => {
  test("summarizeFollowsAndUnfollows maps FOLLOWER/NON_FOLLOWER without collapsing to a single net number silently", () => {
    const breakdown: InstagramBreakdownMetric[] = [
      {
        metric: "follows_and_unfollows",
        breakdown: "follow_type",
        values: [
          { dimension: "FOLLOWER", value: 229 },
          { dimension: "NON_FOLLOWER", value: 63 },
        ],
      },
    ];
    const result = summarizeFollowsAndUnfollows(breakdown);
    assert.equal(result.newFollows, 229);
    assert.equal(result.unfollows, 63);
    assert.equal(result.netChange, 166);
  });

  test("an empty breakdown yields all-null fields, not zeros", () => {
    const result = summarizeFollowsAndUnfollows([]);
    assert.deepEqual(result, { newFollows: null, unfollows: null, netChange: null });
  });
});

describe("getFollowerCountDailySeries", () => {
  test("returns the raw follower_count points unmodified — no sum, no reinterpretation", () => {
    const account = makeAccount({
      dailyMetrics: [
        { date: "2026-08-01", metric: "reach", value: 999 },
        { date: "2026-08-01", metric: "follower_count", value: 38 },
        { date: "2026-08-02", metric: "follower_count", value: 52 },
      ],
    });
    const series = getFollowerCountDailySeries(account);
    assert.equal(series.length, 2);
    assert.deepEqual(
      series.map((s) => s.value),
      [38, 52]
    );
  });
});

describe("periodAverage / latestValue", () => {
  const dailyMetrics: InstagramDailyMetric[] = [
    { date: "2026-08-01", metric: "likes", value: 10 },
    { date: "2026-08-02", metric: "likes", value: 20 },
    { date: "2026-08-03", metric: "likes", value: 30 },
  ];

  test("periodAverage is the mean of the daily points", () => {
    assert.equal(periodAverage(dailyMetrics, "likes"), 20);
  });

  test("latestValue is the most recent date's value, not the sum or average", () => {
    assert.equal(latestValue(dailyMetrics, "likes"), 30);
  });

  test("both return null for a metric with no data points", () => {
    assert.equal(periodAverage(dailyMetrics, "shares"), null);
    assert.equal(latestValue(dailyMetrics, "shares"), null);
  });
});

describe("roundToPrecision", () => {
  test("rounds for display without being used internally by any KPI math", () => {
    assert.equal(roundToPrecision(5.32659, 2), 5.33);
    assert.equal(roundToPrecision(null, 2), null);
  });
});
