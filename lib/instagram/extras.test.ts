import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  breakdownToList,
  buildOnlineHeatmap,
  competitorStatsFrom,
  dailySeries,
  groupBySurface,
  isQuestion,
  parseCompetitorUsernames,
  peakHours,
  relabelGender,
  sortAgeBuckets,
  summarizeComments,
  surfaceSplit,
  sumLists,
} from "./extras.ts";
import { storyTapsFrom } from "./service.ts";
import type { InstagramInsightsResponse } from "./types.ts";

function breakdownResponse(name: string, results: Array<[string, number]>, total?: number): InstagramInsightsResponse {
  return {
    data: [
      {
        id: `x/insights/${name}`,
        name,
        period: "day",
        total_value: {
          value: total,
          breakdowns: [{ dimension_keys: ["k"], results: results.map(([d, value]) => ({ dimension_values: [d], value })) }],
        },
      },
    ],
  };
}

describe("breakdown parsing", () => {
  test("turns a breakdown into label/value pairs, largest first", () => {
    const res = breakdownResponse("follower_demographics", [["F", 10], ["M", 30], ["U", 5]]);
    assert.deepEqual(breakdownToList(res, "follower_demographics").map((x) => x.label), ["M", "F", "U"]);
  });

  test("missing metric gives an empty list, not an error", () => {
    assert.deepEqual(breakdownToList({ data: [] }, "reach"), []);
    assert.deepEqual(breakdownToList(undefined, "reach"), []);
  });

  test("gender codes become words and age buckets sort naturally", () => {
    assert.deepEqual(relabelGender([{ label: "F", value: 1 }]), [{ label: "Women", value: 1 }]);
    const ages = sortAgeBuckets([{ label: "35-44", value: 1 }, { label: "13-17", value: 9 }, { label: "65+", value: 2 }]);
    assert.deepEqual(ages.map((a) => a.label), ["13-17", "35-44", "65+"]);
  });
});

describe("online followers heatmap", () => {
  test("converts Pacific-midnight blocks to IST weekday and hour", () => {
    // 2026-11-16T08:00Z is Monday 00:00 PST. Hour 0 -> 13:30 IST Monday; hour 11 -> 00:30 IST Tuesday.
    const res: InstagramInsightsResponse = {
      data: [
        {
          id: "x",
          name: "online_followers",
          period: "lifetime",
          values: [{ end_time: "2026-11-16T08:00:00+0000", value: { "0": 100, "11": 40 } as unknown as number }],
        },
      ],
    };
    const map = buildOnlineHeatmap(res);
    assert.equal(map[0][13], 100); // Monday 13:xx IST
    assert.equal(map[1][0], 40); // Tuesday 00:xx IST
    assert.equal(map.length, 7);
    assert.equal(map[0].length, 24);
  });

  test("peakHours returns the busiest hours in time order", () => {
    const map = Array.from({ length: 7 }, () => Array.from({ length: 24 }, (_, h) => (h === 21 ? 50 : h === 8 ? 40 : h === 20 ? 45 : 1)));
    assert.deepEqual(peakHours(map, 3), [8, 20, 21]);
  });
});

describe("surface split (organic vs ads)", () => {
  test("groups Meta's product types and computes the ad share", () => {
    const grouped = groupBySurface([
      { label: "AD", value: 90 },
      { label: "CAROUSEL_CONTAINER", value: 4 },
      { label: "CAROUSEL_ITEM", value: 1 },
      { label: "REEL", value: 3 },
      { label: "DEFAULT_DO_NOT_USE", value: 2 },
    ]);
    assert.deepEqual(grouped, [
      { label: "Ads", value: 90 },
      { label: "Carousels", value: 5 },
      { label: "Reels", value: 3 },
      { label: "Other", value: 2 },
    ]);
    const split = surfaceSplit(100, [{ label: "AD", value: 90 }, { label: "REEL", value: 10 }]);
    assert.equal(split.adShare, 90);
    assert.equal(split.total, 100);
  });

  test("no data means no ad share rather than 0%", () => {
    assert.equal(surfaceSplit(null, []).adShare, null);
  });

  test("sumLists adds values per label across chunks", () => {
    assert.deepEqual(
      sumLists([[{ label: "AD", value: 1 }], [{ label: "AD", value: 2 }, { label: "REEL", value: 5 }]]),
      [{ label: "AD", value: 3 }, { label: "REEL", value: 5 }]
    );
  });
});

describe("daily series", () => {
  test("labels each value with the day before Meta's end-of-day stamp", () => {
    const res: InstagramInsightsResponse = {
      data: [{ id: "x", name: "reach", period: "day", values: [{ value: 5, end_time: "2026-11-02T08:00:00+0000" }] }],
    };
    assert.deepEqual(dailySeries(res, "reach"), [{ date: "2026-11-01", value: 5 }]);
  });
});

describe("comments", () => {
  const post = { id: "p1", caption: "Kit launch", permalink: "https://x", contentType: "POST" as const };

  test("spots questions and buying intent", () => {
    assert.ok(isQuestion("What is the price?"));
    assert.ok(isQuestion("Hi I am interested"));
    assert.ok(!isQuestion("So cute 😍"));
  });

  test("counts answered comments and lists the newest unanswered ones", () => {
    const summary = summarizeComments(
      [
        { comment: { id: "1", text: "Rangoli kit please", timestamp: "2026-11-02T00:00:00Z", replies: { data: [{ id: "r" }] } }, post },
        { comment: { id: "2", text: "Rangoli price?", timestamp: "2026-11-03T00:00:00Z" }, post },
        { comment: { id: "3", text: "Lovely rangoli", timestamp: "2026-11-04T00:00:00Z", replies: { data: [] } }, post },
      ],
      1
    );
    assert.equal(summary.totalComments, 3);
    assert.equal(summary.answered, 1);
    assert.equal(Math.round(summary.answeredRate!), 33);
    assert.equal(summary.questions, 2); // "kit" counts as buying intent, "price?" as a question
    assert.deepEqual(summary.unanswered.map((u) => u.id), ["3", "2"]);
    assert.equal(summary.unanswered[1].isQuestion, true);
    assert.deepEqual(summary.topWords[0], { label: "rangoli", value: 3 });
  });

  test("no comments gives a null rate, not 0%", () => {
    assert.equal(summarizeComments([], 0).answeredRate, null);
  });
});

describe("competitors", () => {
  test("parses and validates usernames from the env setting", () => {
    assert.deepEqual(parseCompetitorUsernames(" brand_one, @brand.two ,bad name!, brand_one"), ["brand_one", "brand.two"]);
    assert.deepEqual(parseCompetitorUsernames(undefined), []);
  });

  test("averages public post stats and posting frequency", () => {
    const stats = competitorStatsFrom("brand", false, {
      username: "brand",
      followers_count: 1000,
      media_count: 50,
      media: {
        data: [
          { id: "a", like_count: 30, comments_count: 10, timestamp: "2026-11-15T00:00:00Z" },
          { id: "b", like_count: 10, comments_count: 0, timestamp: "2026-11-08T00:00:00Z" },
          { id: "c", like_count: 20, comments_count: 5, timestamp: "2026-11-01T00:00:00Z" },
        ],
      },
    });
    assert.equal(stats.avgLikes, 20);
    assert.equal(stats.avgComments, 5);
    assert.equal(stats.engagementRate, 2.5);
    assert.equal(stats.postsPerWeek, 1);
  });
});

describe("story taps", () => {
  test("reads the navigation breakdown, defaulting missing actions to 0", () => {
    const taps = storyTapsFrom(breakdownResponse("navigation", [["tap_forward", 5], ["tap_exit", 2]]));
    assert.deepEqual(taps, { forward: 5, back: 0, exit: 2, nextStory: 0 });
    assert.equal(storyTapsFrom(undefined), null);
  });
});
