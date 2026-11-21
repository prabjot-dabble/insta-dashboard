// Normalization layer: raw Graph API responses -> the internal shapes defined in types.ts.
//
// This module only transforms data. No engagement rate, no MoM, no rankings, no trend math — that
// is the KPI layer's job, consuming the output of these functions as input. Every function here is
// defensive: a missing field, an unexpected media type, or one malformed item in a list must not
// throw the whole request away (see the per-function notes below for where that line is drawn).

import type {
  InstagramAccount,
  InstagramAccountMetrics,
  InstagramAccountNormalized,
  InstagramBreakdownMetric,
  InstagramContentType,
  InstagramDailyMetric,
  InstagramDateRange,
  InstagramInsight,
  InstagramInsightsResponse,
  InstagramMedia,
  InstagramMediaMetrics,
  InstagramMediaNormalized,
  InstagramReelMetrics,
  InstagramStory,
  InstagramStoryMetrics,
  InstagramStoryNormalized,
  MetricValue,
} from "./types";

export class NormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NormalizationError";
  }
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new NormalizationError(`Missing or invalid "${fieldName}"`);
  }
  return value;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ----------------------------------------------------------------------------
// Date handling
//
// Every timestamp observed from the real account during verification (media.timestamp,
// story.timestamp, and insight values[].end_time) was UTC with an explicit "+0000" offset.
// Normalization preserves that: `timestamp` fields on normalized objects are passed through
// verbatim as the UTC ISO 8601 string Meta returned, unconverted.
//
// InstagramDailyMetric.date is the one place normalization derives a calendar date rather than
// passing a string through — it's sliced directly from the UTC end_time ("YYYY-MM-DD").
//
// Deliberately NOT converted to Asia/Kolkata here, even though Dabble is India-based and the
// dashboard will eventually display IST. Meta's own day boundary for insights was observed at
// 07:00 UTC (not midnight UTC, not midnight IST) — deciding which local calendar day a metric
// "belongs to" for display or MoM bucketing is an interpretation choice, and this layer only
// transforms shapes, it doesn't make interpretation choices. That conversion belongs to the
// display/KPI layer.
// ----------------------------------------------------------------------------
function toUtcDateString(isoTimestamp: string): string | null {
  const parsed = new Date(isoTimestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function findInsight(insights: InstagramInsight[] | undefined, name: string): InstagramInsight | undefined {
  return insights?.find((insight) => insight?.name === name);
}

function insightData(response: InstagramInsightsResponse | undefined): InstagramInsight[] | undefined {
  return Array.isArray(response?.data) ? response.data : undefined;
}

/** For metric_type=total_value account insights: a single number under total_value.value. */
function extractTotalValue(insights: InstagramInsight[] | undefined, name: string): MetricValue {
  return optionalNumber(findInsight(insights, name)?.total_value?.value);
}

/**
 * For "lifetime" media/reel/story insights: a single number under values[0].value — a DIFFERENT
 * response shape than account-level total_value metrics, verified against real Reel, Feed, and
 * Story insight responses (period="lifetime", values: [{ value }], no total_value key at all).
 */
function extractLifetimeValue(insights: InstagramInsight[] | undefined, name: string): MetricValue {
  return optionalNumber(findInsight(insights, name)?.values?.[0]?.value);
}

/** For metric_type=time_series account insights: one value per day across possibly several metrics. */
function extractDailySeries(
  insights: InstagramInsight[] | undefined,
  names: readonly string[]
): InstagramDailyMetric[] {
  const result: InstagramDailyMetric[] = [];
  for (const name of names) {
    const points = findInsight(insights, name)?.values;
    if (!points) continue;
    for (const point of points) {
      const value = optionalNumber(point?.value);
      const date = typeof point?.end_time === "string" ? toUtcDateString(point.end_time) : null;
      if (value === null || date === null) continue; // malformed point — skip it, don't fabricate
      result.push({ date, metric: name, value });
    }
  }
  return result;
}

/**
 * For total_value metrics queried with a `breakdown` param (e.g. follows_and_unfollows +
 * breakdown=follow_type): dimensioned results instead of a single value. Returns [] if the metric
 * is missing entirely OR present without breakdowns (the no-breakdown-param shape verified in
 * Prompt 3 — an insight object with no total_value key at all).
 */
function extractBreakdown(insights: InstagramInsight[] | undefined, name: string): InstagramBreakdownMetric[] {
  const breakdowns = findInsight(insights, name)?.total_value?.breakdowns;
  if (!breakdowns) return [];

  return breakdowns.map((breakdown) => ({
    metric: name,
    breakdown: breakdown?.dimension_keys?.[0] ?? "unknown",
    values: (breakdown?.results ?? [])
      .filter((result) => Array.isArray(result?.dimension_values) && typeof result?.value === "number")
      .map((result) => ({ dimension: result.dimension_values.join(" / "), value: result.value })),
  }));
}

/**
 * For the dedicated getAccountReachTotal call (metric_type=total_value, metric=reach only) — a
 * single accurate reach number for a <=30-day window, as opposed to the day-by-day time_series
 * form. See endpoints.ts#getAccountReachTotal and the Prompt 6 report's reach-accuracy policy for
 * why this is kept separate from the daily-series reach.
 */
export function normalizeAccountReachTotal(response: InstagramInsightsResponse | undefined): MetricValue {
  return extractTotalValue(insightData(response), "reach");
}

// ----------------------------------------------------------------------------
// Account
// ----------------------------------------------------------------------------

const ACCOUNT_TIME_SERIES_METRICS = ["reach", "follower_count"] as const;

export interface NormalizeAccountInput {
  account: InstagramAccount;
  /** From getAccountInsightsTimeSeries — reach + follower_count. */
  timeSeries?: InstagramInsightsResponse;
  /** From getAccountInsightsTotals — the 10 combined total_value metrics. */
  totals?: InstagramInsightsResponse;
  /** From getAccountFollowsAndUnfollows — requires breakdown=follow_type upstream. */
  followsAndUnfollows?: InstagramInsightsResponse;
  window?: InstagramDateRange;
}

/**
 * Any of timeSeries/totals/followsAndUnfollows may be omitted (not yet fetched, or the call
 * failed upstream and was isolated per endpoints.ts's error-isolation approach) — the result is
 * still a valid normalized account with those metrics as null, not a thrown error. Only a missing
 * account id/username throws, since there is nothing left to represent without them.
 */
export function normalizeAccount(input: NormalizeAccountInput): InstagramAccountNormalized {
  const account = input.account;
  const id = requireString(account?.id, "id");
  const username = requireString(account?.username, "username");

  const totals = insightData(input.totals);
  const timeSeries = insightData(input.timeSeries);
  const follows = insightData(input.followsAndUnfollows);

  const metrics: InstagramAccountMetrics = {
    profileViews: extractTotalValue(totals, "profile_views"),
    websiteClicks: extractTotalValue(totals, "website_clicks"),
    views: extractTotalValue(totals, "views"),
    accountsEngaged: extractTotalValue(totals, "accounts_engaged"),
    totalInteractions: extractTotalValue(totals, "total_interactions"),
    likes: extractTotalValue(totals, "likes"),
    comments: extractTotalValue(totals, "comments"),
    shares: extractTotalValue(totals, "shares"),
    saves: extractTotalValue(totals, "saves"),
    replies: extractTotalValue(totals, "replies"),
  };

  return {
    id,
    username,
    name: optionalString(account.name),
    profilePictureUrl: optionalString(account.profile_picture_url),
    followersCount: optionalNumber(account.followers_count),
    mediaCount: optionalNumber(account.media_count),
    window: input.window ?? null,
    metrics,
    dailyMetrics: extractDailySeries(timeSeries, ACCOUNT_TIME_SERIES_METRICS),
    followsAndUnfollows: extractBreakdown(follows, "follows_and_unfollows"),
  };
}

// ----------------------------------------------------------------------------
// Media (Reels / Posts / Carousels)
// ----------------------------------------------------------------------------

const MEDIA_INSIGHT_METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions"] as const;
const REEL_INSIGHT_METRICS = ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time", "reels_skip_rate"] as const;

/**
 * REELS -> REEL regardless of media_type (a Reel's media_type is VIDEO, same as a plain video
 * post — checking media_product_type first is what stops a Reel from being misclassified as a
 * generic POST). CAROUSEL_ALBUM -> CAROUSEL. IMAGE/VIDEO -> POST as the default for feed content.
 * Anything else (missing/unrecognized media_type, or media_product_type=STORY leaking in from a
 * caller that shouldn't be passing story items here) -> OTHER, never guessed from caption or URL.
 */
export function classifyContentType(
  mediaType: string | undefined,
  mediaProductType: string | undefined
): InstagramContentType {
  if (mediaProductType === "REELS") return "REEL";
  if (mediaProductType === "STORY") return "OTHER";
  if (mediaType === "CAROUSEL_ALBUM") return "CAROUSEL";
  if (mediaType === "IMAGE" || mediaType === "VIDEO") return "POST";
  return "OTHER";
}

function normalizeMediaMetrics(insights: InstagramInsight[] | undefined): InstagramMediaMetrics {
  return {
    reach: extractLifetimeValue(insights, "reach"),
    views: extractLifetimeValue(insights, "views"),
    likes: extractLifetimeValue(insights, "likes"),
    comments: extractLifetimeValue(insights, "comments"),
    shares: extractLifetimeValue(insights, "shares"),
    saved: extractLifetimeValue(insights, "saved"),
    totalInteractions: extractLifetimeValue(insights, "total_interactions"),
    follows: extractLifetimeValue(insights, "follows"),
    profileVisits: extractLifetimeValue(insights, "profile_visits"),
  };
}

function normalizeReelMetrics(insights: InstagramInsight[] | undefined): InstagramReelMetrics {
  return {
    averageWatchTime: extractLifetimeValue(insights, "ig_reels_avg_watch_time"),
    totalVideoViewTime: extractLifetimeValue(insights, "ig_reels_video_view_total_time"),
    skipRate: extractLifetimeValue(insights, "reels_skip_rate"),
  };
}

/**
 * `insights` is optional because base media fields (from getMedia) and metrics (from
 * getReelInsights/getFeedMediaInsights) come from two separate Graph API calls — a media item
 * normalized before its insights have been fetched is still valid, just with every metric null.
 *
 * Throws only for a missing id or timestamp — there's no reasonable normalized item without an
 * identity or a place in time. Everything else (caption, urls, permalink, username, an
 * unrecognized media_type) is handled defensively and never throws; see normalizeMediaList for how
 * a thrown item is isolated rather than failing an entire batch.
 */
export function normalizeMedia(
  raw: InstagramMedia,
  insights?: InstagramInsightsResponse
): InstagramMediaNormalized {
  const id = requireString(raw?.id, "id");
  const timestamp = requireString(raw?.timestamp, "timestamp");
  const contentType = classifyContentType(raw?.media_type, raw?.media_product_type);
  const insightList = insightData(insights);

  const base = {
    id,
    caption: optionalString(raw.caption),
    mediaType: typeof raw.media_type === "string" && raw.media_type.length > 0 ? raw.media_type : "UNKNOWN",
    mediaProductType: optionalString(raw.media_product_type),
    timestamp,
    permalink: optionalString(raw.permalink),
    mediaUrl: optionalString(raw.media_url),
    thumbnailUrl: optionalString(raw.thumbnail_url),
    username: optionalString(raw.username),
    metrics: normalizeMediaMetrics(insightList),
  };

  if (contentType === "REEL") {
    return { ...base, contentType, reelMetrics: normalizeReelMetrics(insightList) };
  }
  return { ...base, contentType };
}

export interface NormalizeSkipReason {
  index: number;
  id: string | null;
  reason: string;
}

export interface NormalizeMediaListResult {
  items: InstagramMediaNormalized[];
  skipped: NormalizeSkipReason[];
}

/**
 * Normalizes a page of media, isolating failures per item so one malformed entry doesn't discard
 * the rest of the page. `insightsById` is optional per item — media not yet paired with insights
 * still normalizes, just with metrics null (see normalizeMedia).
 */
export function normalizeMediaList(
  rawList: readonly InstagramMedia[],
  insightsById: ReadonlyMap<string, InstagramInsightsResponse> = new Map()
): NormalizeMediaListResult {
  const items: InstagramMediaNormalized[] = [];
  const skipped: NormalizeSkipReason[] = [];

  rawList.forEach((raw, index) => {
    try {
      const insights = typeof raw?.id === "string" ? insightsById.get(raw.id) : undefined;
      items.push(normalizeMedia(raw, insights));
    } catch (err) {
      skipped.push({
        index,
        id: typeof raw?.id === "string" ? raw.id : null,
        reason: err instanceof Error ? err.message : "Unknown normalization error",
      });
    }
  });

  return { items, skipped };
}

// ----------------------------------------------------------------------------
// Stories
// ----------------------------------------------------------------------------

const STORY_INSIGHT_METRICS = ["reach", "replies", "follows", "profile_visits", "navigation", "views"] as const;

function normalizeStoryMetrics(insights: InstagramInsight[] | undefined): InstagramStoryMetrics {
  return {
    views: extractLifetimeValue(insights, "views"),
    reach: extractLifetimeValue(insights, "reach"),
    replies: extractLifetimeValue(insights, "replies"),
    follows: extractLifetimeValue(insights, "follows"),
    profileVisits: extractLifetimeValue(insights, "profile_visits"),
    navigation: extractLifetimeValue(insights, "navigation"),
  };
}

/**
 * Represents a story exactly as Meta currently exposes it via /stories — never a reconstruction of
 * one that has already expired. There is no historical archive; a story that stopped being
 * returned by getStories() simply has no InstagramStoryNormalized, and this layer makes no attempt
 * to remember or fabricate one.
 */
export function normalizeStory(
  raw: InstagramStory,
  insights?: InstagramInsightsResponse
): InstagramStoryNormalized {
  const id = requireString(raw?.id, "id");
  const timestamp = requireString(raw?.timestamp, "timestamp");

  return {
    id,
    mediaType: typeof raw.media_type === "string" && raw.media_type.length > 0 ? raw.media_type : "UNKNOWN",
    timestamp,
    permalink: optionalString(raw.permalink),
    mediaUrl: optionalString(raw.media_url),
    thumbnailUrl: optionalString(raw.thumbnail_url),
    metrics: normalizeStoryMetrics(insightData(insights)),
  };
}

export interface NormalizeStoriesListResult {
  items: InstagramStoryNormalized[];
  skipped: NormalizeSkipReason[];
}

export function normalizeStoriesList(
  rawList: readonly InstagramStory[],
  insightsById: ReadonlyMap<string, InstagramInsightsResponse> = new Map()
): NormalizeStoriesListResult {
  const items: InstagramStoryNormalized[] = [];
  const skipped: NormalizeSkipReason[] = [];

  rawList.forEach((raw, index) => {
    try {
      const insights = typeof raw?.id === "string" ? insightsById.get(raw.id) : undefined;
      items.push(normalizeStory(raw, insights));
    } catch (err) {
      skipped.push({
        index,
        id: typeof raw?.id === "string" ? raw.id : null,
        reason: err instanceof Error ? err.message : "Unknown normalization error",
      });
    }
  });

  return { items, skipped };
}

// Exported for tests and for callers building the metric name list dynamically.
export const NORMALIZE_METRIC_NAMES = {
  accountTimeSeries: ACCOUNT_TIME_SERIES_METRICS,
  media: MEDIA_INSIGHT_METRICS,
  reel: REEL_INSIGHT_METRICS,
  story: STORY_INSIGHT_METRICS,
};
