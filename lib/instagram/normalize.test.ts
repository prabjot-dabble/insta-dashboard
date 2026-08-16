// Unit tests for the normalization layer. Fixtures below are trimmed copies of the ACTUAL Graph
// API v25.0 responses captured while verifying the Dabble account in Prompt 3 (long CDN URLs
// shortened for readability — the field names and response *shapes* are unchanged). These are not
// invented sample data; where a test needs a deliberately broken/missing shape, that's called out
// explicitly in the test name and a comment.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Node's native ESM loader resolves relative specifiers per spec (explicit extension required),
// unlike Next.js's bundler-mode resolution used for the app itself — hence ".ts" here specifically.
import {
  NormalizationError,
  classifyContentType,
  normalizeAccount,
  normalizeMedia,
  normalizeMediaList,
  normalizeStory,
  normalizeStoriesList,
} from "./normalize.ts";
import type { InstagramAccount, InstagramInsightsResponse, InstagramMedia, InstagramStory } from "./types.ts";

// ----------------------------------------------------------------------------
// Fixtures — real response shapes from the live Dabble account (Graph API v25.0)
// ----------------------------------------------------------------------------

const REAL_ACCOUNT: InstagramAccount = {
  id: "17841411481284458",
  username: "dabbleplayart",
  name: "Dabble Playart | Mom Made Art Products",
  profile_picture_url: "https://scontent.fblr20-3.fna.fbcdn.net/v/t51.82787-15/641578069.jpg",
  followers_count: 53376,
  media_count: 2209,
};

const REAL_TIME_SERIES: InstagramInsightsResponse = {
  data: [
    {
      name: "reach",
      period: "day",
      title: "Reach",
      description: "The total number of times that the business account's media objects have been uniquely viewed.",
      values: [
        { value: 16449, end_time: "2026-08-08T07:00:00+0000" },
        { value: 17165, end_time: "2026-08-09T07:00:00+0000" },
        { value: 2719, end_time: "2026-08-14T07:00:00+0000" },
      ],
      id: "17841411481284458/insights/reach/day",
    },
    {
      name: "follower_count",
      period: "day",
      title: "Follower count",
      description: "The total number of unique accounts following this profile",
      values: [
        { value: 38, end_time: "2026-08-08T07:00:00+0000" },
        { value: 52, end_time: "2026-08-09T07:00:00+0000" },
        { value: 0, end_time: "2026-08-14T07:00:00+0000" },
      ],
      id: "17841411481284458/insights/follower_count/day",
    },
  ],
};

const REAL_TOTALS: InstagramInsightsResponse = {
  data: [
    { name: "profile_views", period: "day", title: "Profile visits", description: "", total_value: { value: 1648 }, id: "x" },
    { name: "website_clicks", period: "day", title: "Website link taps", description: "", total_value: { value: 185 }, id: "x" },
    { name: "views", period: "day", title: "Views", description: "", total_value: { value: 217105 }, id: "x" },
    { name: "accounts_engaged", period: "day", title: "Accounts engaged", description: "", total_value: { value: 1189 }, id: "x" },
    { name: "total_interactions", period: "day", title: "Content interactions", description: "", total_value: { value: 1869 }, id: "x" },
    { name: "likes", period: "day", title: "Likes", description: "", total_value: { value: 914 }, id: "x" },
    { name: "comments", period: "day", title: "Comments", description: "", total_value: { value: 14 }, id: "x" },
    { name: "shares", period: "day", title: "Shares", description: "", total_value: { value: 282 }, id: "x" },
    { name: "saves", period: "day", title: "Saves", description: "", total_value: { value: 362 }, id: "x" },
    { name: "replies", period: "day", title: "Replies", description: "", total_value: { value: 3 }, id: "x" },
  ],
};

const REAL_FOLLOWS_AND_UNFOLLOWS: InstagramInsightsResponse = {
  data: [
    {
      name: "follows_and_unfollows",
      period: "day",
      title: "Follows and unfollows",
      description: "",
      total_value: {
        breakdowns: [
          {
            dimension_keys: ["follow_type"],
            results: [
              { dimension_values: ["FOLLOWER"], value: 229 },
              { dimension_values: ["NON_FOLLOWER"], value: 63 },
            ],
          },
        ],
      },
      id: "x",
    },
  ],
};

// Real shape observed WITHOUT breakdown=follow_type: the metric name is present but total_value
// is entirely absent — not zero, genuinely missing.
const FOLLOWS_AND_UNFOLLOWS_WITHOUT_BREAKDOWN: InstagramInsightsResponse = {
  data: [{ name: "follows_and_unfollows", period: "day", title: "Follows and unfollows", description: "", id: "x" }],
};

const REAL_REEL: InstagramMedia = {
  id: "17936738871340709",
  caption: "This Independence Day, let little hands make the tricolour their own",
  media_type: "VIDEO",
  media_product_type: "REELS",
  thumbnail_url: "https://scontent.cdninstagram.com/v/t51.82787-15/771400975.jpg",
  permalink: "https://www.instagram.com/reel/Db74z2oulDf/",
  timestamp: "2026-08-12T09:56:11+0000",
  username: "dabbleplayart",
};

const REAL_REEL_INSIGHTS: InstagramInsightsResponse = {
  data: [
    { name: "reach", period: "lifetime", title: "Accounts reached", description: "", values: [{ value: 3036 }], id: "x" },
    { name: "saved", period: "lifetime", title: "Saved", description: "", values: [{ value: 6 }], id: "x" },
    { name: "likes", period: "lifetime", title: "Likes", description: "", values: [{ value: 47 }], id: "x" },
    // Real, deliberately-zero value (not missing) — Meta actually returned 0 comments.
    { name: "comments", period: "lifetime", title: "Comments", description: "", values: [{ value: 0 }], id: "x" },
    { name: "shares", period: "lifetime", title: "Shares", description: "", values: [{ value: 2 }], id: "x" },
    { name: "total_interactions", period: "lifetime", title: "Reels interactions", description: "", values: [{ value: 57 }], id: "x" },
    { name: "views", period: "lifetime", title: "Views", description: "", values: [{ value: 4126 }], id: "x" },
    { name: "ig_reels_avg_watch_time", period: "lifetime", title: "Reels average watch time", description: "", values: [{ value: 7568 }], id: "x" },
    { name: "ig_reels_video_view_total_time", period: "lifetime", title: "Video view total time", description: "", values: [{ value: 23938309 }], id: "x" },
    { name: "reels_skip_rate", period: "lifetime", title: "Skip rate", description: "", values: [{ value: 59.1 }], id: "x" },
  ],
};

const REAL_CAROUSEL: InstagramMedia = {
  id: "18221979982325340",
  caption: "The Little Creator Challenge is back bigger than ever!",
  media_type: "CAROUSEL_ALBUM",
  media_product_type: "FEED",
  media_url: "https://scontent.cdninstagram.com/v/t51.82787-15/762466256.jpg",
  permalink: "https://www.instagram.com/p/DbnrJ_2iccN/",
  timestamp: "2026-08-04T13:29:49+0000",
  username: "dabbleplayart",
};

const REAL_CAROUSEL_INSIGHTS: InstagramInsightsResponse = {
  data: [
    { name: "reach", period: "lifetime", title: "Accounts reached", description: "", values: [{ value: 1543 }], id: "x" },
    { name: "saved", period: "lifetime", title: "Saved", description: "", values: [{ value: 5 }], id: "x" },
    { name: "likes", period: "lifetime", title: "Likes", description: "", values: [{ value: 54 }], id: "x" },
    { name: "comments", period: "lifetime", title: "Comments", description: "", values: [{ value: 50 }], id: "x" },
    { name: "shares", period: "lifetime", title: "Shares", description: "", values: [{ value: 8 }], id: "x" },
    { name: "total_interactions", period: "lifetime", title: "Post interactions", description: "", values: [{ value: 120 }], id: "x" },
    { name: "views", period: "lifetime", title: "Views", description: "", values: [{ value: 3323 }], id: "x" },
    // No "shares" omission here, but this fixture intentionally has no ig_reels_* metrics at all —
    // used by the "unavailable metrics" test to confirm a Feed post never gets reelMetrics.
  ],
};

const REAL_STORY: InstagramStory = {
  id: "18019445111883030",
  media_type: "VIDEO",
  media_product_type: "STORY",
  media_url: "https://instagram.fblr20-1.fna.fbcdn.net/o1/v/t2/f2/sample.mp4",
  permalink: "https://www.instagram.com/stories/dabbleplayart/3962878663620055300",
  thumbnail_url: "https://scontent.cdninstagram.com/v/t51.71878-15/774099431.jpg",
  timestamp: "2026-08-13T14:39:20+0000",
};

const REAL_STORY_INSIGHTS: InstagramInsightsResponse = {
  data: [
    { name: "reach", period: "lifetime", title: "Accounts reached", description: "", values: [{ value: 63 }], id: "x" },
    { name: "replies", period: "lifetime", title: "Replies", description: "", values: [{ value: 0 }], id: "x" },
    { name: "follows", period: "lifetime", title: "Follows", description: "", values: [{ value: 0 }], id: "x" },
    { name: "profile_visits", period: "lifetime", title: "Profile visits", description: "", values: [{ value: 1 }], id: "x" },
    { name: "navigation", period: "lifetime", title: "Navigation", description: "", values: [{ value: 69 }], id: "x" },
    { name: "views", period: "lifetime", title: "Views", description: "", values: [{ value: 80 }], id: "x" },
  ],
};

// ----------------------------------------------------------------------------
// 1. Normal account response
// ----------------------------------------------------------------------------
describe("normalizeAccount — normal response", () => {
  test("maps profile fields and all three insight shapes", () => {
    const result = normalizeAccount({
      account: REAL_ACCOUNT,
      timeSeries: REAL_TIME_SERIES,
      totals: REAL_TOTALS,
      followsAndUnfollows: REAL_FOLLOWS_AND_UNFOLLOWS,
      window: { since: "2026-08-08", until: "2026-08-14" },
    });

    assert.equal(result.id, "17841411481284458");
    assert.equal(result.username, "dabbleplayart");
    assert.equal(result.followersCount, 53376);
    assert.equal(result.metrics.likes, 914);
    assert.equal(result.metrics.saves, 362);
    assert.equal(result.window?.since, "2026-08-08");
  });
});

// ----------------------------------------------------------------------------
// 2. Missing account metric
// ----------------------------------------------------------------------------
describe("normalizeAccount — missing metric", () => {
  test("a metric absent from the totals response normalizes to null, others unaffected", () => {
    const totalsMissingWebsiteClicks: InstagramInsightsResponse = {
      data: REAL_TOTALS.data.filter((insight) => insight.name !== "website_clicks"),
    };

    const result = normalizeAccount({ account: REAL_ACCOUNT, totals: totalsMissingWebsiteClicks });

    assert.equal(result.metrics.websiteClicks, null);
    assert.equal(result.metrics.likes, 914); // untouched
  });
});

// ----------------------------------------------------------------------------
// 3. Time-series response
// ----------------------------------------------------------------------------
describe("normalizeAccount — time-series shape", () => {
  test("flattens reach and follower_count into dated entries", () => {
    const result = normalizeAccount({ account: REAL_ACCOUNT, timeSeries: REAL_TIME_SERIES });

    assert.equal(result.dailyMetrics.length, 6); // 3 reach + 3 follower_count points
    const reachDay1 = result.dailyMetrics.find((m) => m.metric === "reach" && m.date === "2026-08-08");
    assert.equal(reachDay1?.value, 16449);
    const followerDay1 = result.dailyMetrics.find((m) => m.metric === "follower_count" && m.date === "2026-08-08");
    assert.equal(followerDay1?.value, 38);
  });
});

// ----------------------------------------------------------------------------
// 4. Total-value response
// ----------------------------------------------------------------------------
describe("normalizeAccount — total-value shape", () => {
  test("maps each total_value.value to its named metric field", () => {
    const result = normalizeAccount({ account: REAL_ACCOUNT, totals: REAL_TOTALS });

    assert.deepEqual(result.metrics, {
      profileViews: 1648,
      websiteClicks: 185,
      views: 217105,
      accountsEngaged: 1189,
      totalInteractions: 1869,
      likes: 914,
      comments: 14,
      shares: 282,
      saves: 362,
      replies: 3,
    });
  });
});

// ----------------------------------------------------------------------------
// 5. Breakdown response
// ----------------------------------------------------------------------------
describe("normalizeAccount — breakdown shape", () => {
  test("preserves FOLLOWER/NON_FOLLOWER dimensions instead of collapsing to a net number", () => {
    const result = normalizeAccount({ account: REAL_ACCOUNT, followsAndUnfollows: REAL_FOLLOWS_AND_UNFOLLOWS });

    assert.equal(result.followsAndUnfollows.length, 1);
    assert.equal(result.followsAndUnfollows[0].breakdown, "follow_type");
    assert.deepEqual(result.followsAndUnfollows[0].values, [
      { dimension: "FOLLOWER", value: 229 },
      { dimension: "NON_FOLLOWER", value: 63 },
    ]);
  });

  test("the no-breakdown-param shape (metric present, total_value absent) normalizes to an empty list, not an error", () => {
    const result = normalizeAccount({
      account: REAL_ACCOUNT,
      followsAndUnfollows: FOLLOWS_AND_UNFOLLOWS_WITHOUT_BREAKDOWN,
    });
    assert.deepEqual(result.followsAndUnfollows, []);
  });
});

// ----------------------------------------------------------------------------
// 6. Reel response
// ----------------------------------------------------------------------------
describe("normalizeMedia — Reel", () => {
  test("classifies as REEL and populates reelMetrics from lifetime values", () => {
    const result = normalizeMedia(REAL_REEL, REAL_REEL_INSIGHTS);

    assert.equal(result.contentType, "REEL");
    assert.equal(result.metrics.views, 4126);
    assert.equal(result.metrics.saved, 6);
    if (result.contentType === "REEL") {
      assert.equal(result.reelMetrics.averageWatchTime, 7568);
      assert.equal(result.reelMetrics.totalVideoViewTime, 23938309);
      assert.equal(result.reelMetrics.skipRate, 59.1);
    } else {
      assert.fail("expected contentType REEL");
    }
  });

  test("a VIDEO with media_product_type REELS is never misclassified as a generic POST", () => {
    assert.equal(classifyContentType("VIDEO", "REELS"), "REEL");
  });
});

// ----------------------------------------------------------------------------
// 7. Carousel response
// ----------------------------------------------------------------------------
describe("normalizeMedia — Carousel", () => {
  test("CAROUSEL_ALBUM classifies as CAROUSEL and has no reelMetrics", () => {
    const result = normalizeMedia(REAL_CAROUSEL, REAL_CAROUSEL_INSIGHTS);

    assert.equal(result.contentType, "CAROUSEL");
    assert.equal(result.metrics.likes, 54);
    assert.equal(result.metrics.totalInteractions, 120);
    assert.ok(!("reelMetrics" in result));
  });
});

// ----------------------------------------------------------------------------
// 8. Normal feed post
// ----------------------------------------------------------------------------
describe("normalizeMedia — feed post", () => {
  test("a single-image FEED post classifies as POST", () => {
    const post: InstagramMedia = {
      id: "18300000000000001",
      caption: "A single product photo",
      media_type: "IMAGE",
      media_product_type: "FEED",
      media_url: "https://scontent.cdninstagram.com/v/example.jpg",
      permalink: "https://www.instagram.com/p/example/",
      timestamp: "2026-08-01T10:00:00+0000",
      username: "dabbleplayart",
    };

    const result = normalizeMedia(post);
    assert.equal(result.contentType, "POST");
    // No insights passed in — metrics must all be unavailable (null), not fabricated zeros.
    assert.equal(result.metrics.reach, null);
    assert.equal(result.metrics.likes, null);
  });
});

// ----------------------------------------------------------------------------
// 9. Story response
// ----------------------------------------------------------------------------
describe("normalizeStory", () => {
  test("normalizes a currently-active story with its insights", () => {
    const result = normalizeStory(REAL_STORY, REAL_STORY_INSIGHTS);

    assert.equal(result.id, "18019445111883030");
    assert.equal(result.metrics.views, 80);
    assert.equal(result.metrics.reach, 63);
    assert.equal(result.metrics.navigation, 69);
    // Real, deliberately-zero values — Meta returned 0, not "no data".
    assert.equal(result.metrics.replies, 0);
    assert.equal(result.metrics.follows, 0);
  });
});

// ----------------------------------------------------------------------------
// 10. Missing media fields
// ----------------------------------------------------------------------------
describe("normalizeMedia — missing optional fields", () => {
  test("missing caption/thumbnail/media_url/username normalize to null, not a crash", () => {
    const sparse: InstagramMedia = {
      id: "18300000000000002",
      media_type: "VIDEO",
      media_product_type: "REELS",
      timestamp: "2026-08-01T10:00:00+0000",
      // no caption, no thumbnail_url, no media_url, no permalink, no username
    };

    const result = normalizeMedia(sparse);
    assert.equal(result.caption, null);
    assert.equal(result.thumbnailUrl, null);
    assert.equal(result.mediaUrl, null);
    assert.equal(result.permalink, null);
    assert.equal(result.username, null);
  });

  test("a missing id throws NormalizationError", () => {
    const noId = { media_type: "IMAGE", timestamp: "2026-08-01T10:00:00+0000" } as unknown as InstagramMedia;
    assert.throws(() => normalizeMedia(noId), NormalizationError);
  });

  test("normalizeMediaList isolates one malformed item instead of discarding the whole page", () => {
    const malformed = { media_type: "IMAGE", timestamp: "2026-08-01T10:00:00+0000" } as unknown as InstagramMedia;
    const { items, skipped } = normalizeMediaList([REAL_CAROUSEL, malformed, REAL_REEL]);

    assert.equal(items.length, 2);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0].index, 1);
    assert.match(skipped[0].reason, /id/);
  });
});

// ----------------------------------------------------------------------------
// 11. Unavailable metrics
// ----------------------------------------------------------------------------
describe("normalizeMedia — unavailable metrics", () => {
  test("a Feed post's normalized shape never has reel-specific fields, even though it wasn't asked for them", () => {
    const result = normalizeMedia(REAL_CAROUSEL, REAL_CAROUSEL_INSIGHTS);
    assert.equal(result.contentType, "CAROUSEL");
    assert.ok(!("reelMetrics" in result));
  });

  test("a metric never present in the insights response is null, not zero", () => {
    const reelInsightsMissingShares: InstagramInsightsResponse = {
      data: REAL_REEL_INSIGHTS.data.filter((insight) => insight.name !== "shares"),
    };
    const result = normalizeMedia(REAL_REEL, reelInsightsMissingShares);
    assert.equal(result.metrics.shares, null);
  });
});

// ----------------------------------------------------------------------------
// 12. Zero values (must survive as 0, never collapsed to null/unavailable)
// ----------------------------------------------------------------------------
describe("zero vs unavailable", () => {
  test("Meta-reported zero (Reel comments: 0) normalizes to 0, not null", () => {
    const result = normalizeMedia(REAL_REEL, REAL_REEL_INSIGHTS);
    assert.equal(result.metrics.comments, 0);
    assert.notEqual(result.metrics.comments, null);
  });

  test("Meta-reported zero on a Story (replies: 0, follows: 0) normalizes to 0, not null", () => {
    const result = normalizeStory(REAL_STORY, REAL_STORY_INSIGHTS);
    assert.equal(result.metrics.replies, 0);
    assert.equal(result.metrics.follows, 0);
  });

  test("follower_count of 0 in the time series is a real data point, not skipped", () => {
    const result = normalizeAccount({ account: REAL_ACCOUNT, timeSeries: REAL_TIME_SERIES });
    const lastDay = result.dailyMetrics.find((m) => m.metric === "follower_count" && m.date === "2026-08-14");
    assert.equal(lastDay?.value, 0);
  });
});

// ----------------------------------------------------------------------------
// 13. Unknown media type
// ----------------------------------------------------------------------------
describe("classifyContentType — unknown / unexpected values", () => {
  test("an unrecognized media_type classifies as OTHER instead of throwing or guessing", () => {
    assert.equal(classifyContentType("AUDIO", "FEED"), "OTHER");
  });

  test("a missing media_product_type with a recognized media_type still falls back sensibly to POST", () => {
    assert.equal(classifyContentType("IMAGE", undefined), "POST");
  });

  test("normalizeMedia with an unknown media_type produces a valid OTHER item, not a crash", () => {
    const odd: InstagramMedia = {
      id: "18300000000000003",
      media_type: "AUDIO" as InstagramMedia["media_type"],
      timestamp: "2026-08-01T10:00:00+0000",
    };
    const result = normalizeMedia(odd);
    assert.equal(result.contentType, "OTHER");
    assert.equal(result.mediaType, "AUDIO");
  });
});

// ----------------------------------------------------------------------------
// Bonus: defensive handling of malformed responses (section 11)
// ----------------------------------------------------------------------------
describe("defensive handling of malformed insight responses", () => {
  test("a totals response with data missing entirely produces all-null metrics, not a crash", () => {
    const malformed = {} as unknown as InstagramInsightsResponse;
    const result = normalizeAccount({ account: REAL_ACCOUNT, totals: malformed });
    assert.equal(result.metrics.likes, null);
    assert.equal(result.metrics.saves, null);
  });

  test("a malformed timestamp in a time-series point is skipped rather than fabricated", () => {
    const badPoint: InstagramInsightsResponse = {
      data: [
        {
          name: "reach",
          period: "day",
          title: "Reach",
          description: "",
          values: [{ value: 100, end_time: "not-a-real-timestamp" }],
          id: "x",
        },
      ],
    };
    const result = normalizeAccount({ account: REAL_ACCOUNT, timeSeries: badPoint });
    assert.equal(result.dailyMetrics.length, 0);
  });

  test("normalizeStoriesList isolates a story missing its id", () => {
    const badStory = { media_type: "IMAGE", timestamp: "2026-08-01T10:00:00+0000" } as unknown as InstagramStory;
    const { items, skipped } = normalizeStoriesList([REAL_STORY, badStory]);
    assert.equal(items.length, 1);
    assert.equal(skipped.length, 1);
  });
});
