// Instagram Graph API endpoint functions — one function per verified Graph API call.
//
// Every metric name and grouping below was verified against the real Dabble account on Graph API
// v25.0 (see the Prompt 3 report for the full verification log). Nothing here is assumed from
// documentation alone. Where Meta rejected a combination or a metric outright, that's recorded in
// a comment next to the working alternative — not silently dropped.
//
// This module only knows Instagram-specific request shapes (fields, metrics, groupings). All
// authentication, URL construction, and low-level error handling live in client.ts.

// ".ts" on the value import below is required for Node's native ESM test runner to resolve it
// (see service.ts's note on the same issue) — the type-only import doesn't need it, since type
// imports are erased entirely and never reach module resolution at runtime.
import { graphGet } from "./client.ts";
import type {
  InstagramAccount,
  InstagramInsightsResponse,
  InstagramMediaPage,
  InstagramPaging,
  InstagramStory,
} from "./types";

const ACCOUNT_FIELDS = "id,username,name,profile_picture_url,followers_count,media_count";

const MEDIA_FIELDS =
  "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username";

const STORY_FIELDS = "id,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";

const MAX_INSIGHTS_WINDOW_SECONDS = 30 * 24 * 60 * 60;

/**
 * Graph API rejects any account-level insights request where (until - since) exceeds 30 days
 * ("There cannot be more than 30 days (2592000 s) between since and until" — verified directly,
 * a 90-day window fails). Callers building multi-month trends must chunk into <=30-day requests
 * themselves; this just fails fast with a clear message instead of forwarding a cryptic Meta error.
 */
function assertWithinInsightsWindow(sinceUnix: number, untilUnix: number): void {
  if (untilUnix - sinceUnix > MAX_INSIGHTS_WINDOW_SECONDS) {
    throw new Error(
      `Instagram account insights only support windows up to 30 days; got ${
        Math.round((untilUnix - sinceUnix) / 86400)
      } days. Split the request into multiple <=30-day calls.`
    );
  }
}

/** GET /{ig-user-id}?fields=... — basic account profile info. */
export async function getAccount(instagramBusinessId: string): Promise<InstagramAccount> {
  return graphGet<InstagramAccount>(instagramBusinessId, { fields: ACCOUNT_FIELDS });
}

/**
 * Account-level time_series metrics (period=day, one value per day).
 *
 * Verified working together: reach, follower_count.
 * Verified INCOMPATIBLE with metric_type=time_series (Meta error #100 "incompatible with the
 * metric type"): profile_views, website_clicks, views, online_followers — these only work as
 * metric_type=total_value (see getAccountInsightsTotals).
 */
export async function getAccountInsightsTimeSeries(
  instagramBusinessId: string,
  sinceUnix: number,
  untilUnix: number
): Promise<InstagramInsightsResponse> {
  assertWithinInsightsWindow(sinceUnix, untilUnix);
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric: "reach,follower_count",
    metric_type: "time_series",
    period: "day",
    since: String(sinceUnix),
    until: String(untilUnix),
  });
}

/**
 * Account-level total_value metrics for the given window. All 10 verified to combine into a
 * single request (no sub-grouping needed) — confirmed against the real account.
 *
 * `impressions` was tried and does NOT exist in this endpoint's metric vocabulary at all (Meta's
 * own error listed every valid metric name for v25.0 and impressions was not among them) — `views`
 * is the replacement.
 */
export async function getAccountInsightsTotals(
  instagramBusinessId: string,
  sinceUnix: number,
  untilUnix: number
): Promise<InstagramInsightsResponse> {
  assertWithinInsightsWindow(sinceUnix, untilUnix);
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric:
      "profile_views,website_clicks,views,accounts_engaged,total_interactions,likes,comments,shares,saves,replies",
    metric_type: "total_value",
    period: "day",
    since: String(sinceUnix),
    until: String(untilUnix),
  });
}

/**
 * follows_and_unfollows is kept separate from getAccountInsightsTotals: without
 * breakdown=follow_type it returns a metric entry with no total_value at all (verified — the
 * field is silently missing, not zero). With the breakdown it returns two dimensioned results,
 * FOLLOWER and NON_FOLLOWER, under total_value.breakdowns rather than a plain total_value.value —
 * a different response shape than every other metric here, which is why it isn't merged into the
 * flat total_value group above.
 */
export async function getAccountFollowsAndUnfollows(
  instagramBusinessId: string,
  sinceUnix: number,
  untilUnix: number
): Promise<InstagramInsightsResponse> {
  assertWithinInsightsWindow(sinceUnix, untilUnix);
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric: "follows_and_unfollows",
    metric_type: "total_value",
    period: "day",
    breakdown: "follow_type",
    since: String(sinceUnix),
    until: String(untilUnix),
  });
}

/**
 * Account-level reach as a SINGLE accurate number for the whole window (metric_type=total_value),
 * rather than the day-by-day form getAccountInsightsTimeSeries returns. Verified working against
 * the real account during Prompt 3 exploration (a 7-day window returned total_value.value=70651).
 *
 * Kept as its own call rather than folded into getAccountInsightsTotals: that function's 10-metric
 * combination was verified as a group WITHOUT reach in it, and reach combined with those same 10
 * was never independently tested — this stays isolated to match only what was actually verified.
 *
 * Still subject to the same 30-day window limit as every other account insights call. That specific
 * combination (metric_type=total_value + reach + a >30-day window) was not independently
 * re-verified to fail the same way the time_series case was — applying the same guard here is a
 * conservative assumption, not a re-confirmed fact (see the Prompt 6 report).
 */
export async function getAccountReachTotal(
  instagramBusinessId: string,
  sinceUnix: number,
  untilUnix: number
): Promise<InstagramInsightsResponse> {
  assertWithinInsightsWindow(sinceUnix, untilUnix);
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric: "reach",
    metric_type: "total_value",
    period: "day",
    since: String(sinceUnix),
    until: String(untilUnix),
  });
}

export interface GetMediaOptions {
  /** Defaults to 25. Capped at 50 — this layer never auto-paginates to "all" media. */
  limit?: number;
  /** Cursor from a previous page's paging.cursors.after. */
  after?: string;
}

const DEFAULT_MEDIA_PAGE_SIZE = 25;
const MAX_MEDIA_PAGE_SIZE = 50;

/**
 * GET /{ig-user-id}/media — one page of media (feed posts, carousels, reels). Does not include
 * Stories; Meta only exposes those via the separate /stories endpoint (see getStories).
 *
 * Distinguishing content types from the response: media_product_type is "REELS" for Reels and
 * "FEED" for everything else (single image/video posts AND carousels alike) — media_type is what
 * actually tells a CAROUSEL_ALBUM apart from a single-item FEED post.
 *
 * Caller controls pagination explicitly via `after`; this function never follows `next` itself.
 */
export async function getMedia(
  instagramBusinessId: string,
  options: GetMediaOptions = {}
): Promise<InstagramMediaPage> {
  const limit = Math.min(options.limit ?? DEFAULT_MEDIA_PAGE_SIZE, MAX_MEDIA_PAGE_SIZE);
  const params: Record<string, string> = {
    fields: MEDIA_FIELDS,
    limit: String(limit),
  };
  if (options.after) {
    params.after = options.after;
  }
  return graphGet<InstagramMediaPage>(`${instagramBusinessId}/media`, params);
}

/**
 * Media-level insight metric names verified against a real REELS item and a real FEED/CAROUSEL_ALBUM
 * item. Meta's own error message (triggered deliberately to enumerate valid names) also lists
 * replies, follows, profile_visits, profile_activity, navigation, reels_skip_rate, reposts,
 * facebook_views, crossposted_views, total_views, total_likes, total_comments, link_clicks as
 * accepted metric *names* for this endpoint — those are semantically Story/cross-post oriented and
 * were NOT verified against a Reel or Feed post here, so they're deliberately left out of the
 * typed sets below rather than assumed safe.
 */
export type ReelInsightMetric =
  | "reach"
  | "saved"
  | "likes"
  | "comments"
  | "shares"
  | "total_interactions"
  | "views"
  | "ig_reels_avg_watch_time"
  | "ig_reels_video_view_total_time"
  | "reels_skip_rate";

export type FeedMediaInsightMetric =
  | "reach"
  | "saved"
  | "likes"
  | "comments"
  | "shares"
  | "total_interactions"
  | "views"
  | "follows"
  | "profile_visits";

const REEL_INSIGHT_METRICS: ReelInsightMetric[] = [
  "reach",
  "saved",
  "likes",
  "comments",
  "shares",
  "total_interactions",
  "views",
  "ig_reels_avg_watch_time",
  "ig_reels_video_view_total_time",
  "reels_skip_rate",
];

// follows + profile_visits verified to combine with the other seven against a real single-image
// post and a real carousel (Nov 2026). Meta rejects both for Reels.
const FEED_MEDIA_INSIGHT_METRICS: FeedMediaInsightMetric[] = [
  "reach",
  "saved",
  "likes",
  "comments",
  "shares",
  "total_interactions",
  "views",
  "follows",
  "profile_visits",
];

/**
 * GET /{media-id}/insights?metric=... — generic media insights call. Callers pass the exact
 * metric list; use getReelInsights/getFeedMediaInsights below for the pre-verified groupings
 * rather than guessing a new combination here.
 *
 * `impressions` is REJECTED for both media product types as of v25.0 — confirmed with real calls:
 * REELS -> "(#100) The Media Insights API does not support the impressions metric for this media
 * product type."; FEED -> "(#100) Starting from version v22.0 and above, the impressions metric is
 * no longer supported for the queried media." `views` is the replacement in both cases.
 */
export async function getMediaInsights(
  mediaId: string,
  metrics: readonly string[]
): Promise<InstagramInsightsResponse> {
  return graphGet<InstagramInsightsResponse>(`${mediaId}/insights`, {
    metric: metrics.join(","),
  });
}

/** All 10 Reel metrics verified to combine into a single request against a real Dabble Reel. */
export async function getReelInsights(mediaId: string): Promise<InstagramInsightsResponse> {
  return getMediaInsights(mediaId, REEL_INSIGHT_METRICS);
}

/**
 * For feed posts and carousels. Verified against a real CAROUSEL_ALBUM item; the same metric set
 * is expected to apply to single-item feed posts since Meta groups them under the same
 * media_product_type ("FEED"), but that has not been separately verified against a single-image
 * or single-video feed post yet.
 */
export async function getFeedMediaInsights(mediaId: string): Promise<InstagramInsightsResponse> {
  return getMediaInsights(mediaId, FEED_MEDIA_INSIGHT_METRICS);
}

export interface InstagramStoriesPage {
  data: InstagramStory[];
  paging?: InstagramPaging;
}

/**
 * GET /{ig-user-id}/stories — only currently-available (non-expired) stories. Meta does not expose
 * historical stories through this endpoint; once a story's 24-hour window passes it stops
 * appearing here at all, verified-available window (no arbitrary lookback is possible or
 * pretended by this layer).
 */
export async function getStories(instagramBusinessId: string): Promise<InstagramStoriesPage> {
  return graphGet<InstagramStoriesPage>(`${instagramBusinessId}/stories`, {
    fields: STORY_FIELDS,
  });
}

/**
 * GET /{story-id}/insights — verified as a single combined request against a real, currently
 * active Dabble story.
 */
export async function getStoryInsights(storyId: string): Promise<InstagramInsightsResponse> {
  return graphGet<InstagramInsightsResponse>(`${storyId}/insights`, {
    metric: "reach,replies,follows,profile_visits,navigation,views",
  });
}

// ============================================================================
// Additional free insights (all verified against the real Dabble account, v25.0, Nov 2026).
// None of these cost anything; the only limit is Meta's per-hour rate cap.
// ============================================================================

export type DemographicBreakdown = "age" | "gender" | "city" | "country";

/**
 * GET /{ig-user-id}/insights?metric=follower_demographics — lifetime snapshot of who follows the
 * account. Verified for all four breakdowns; one breakdown per request (Meta returns a single
 * breakdown block per call).
 */
export async function getFollowerDemographics(
  instagramBusinessId: string,
  breakdown: DemographicBreakdown
): Promise<InstagramInsightsResponse> {
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric: "follower_demographics",
    period: "lifetime",
    metric_type: "total_value",
    breakdown,
  });
}

/**
 * Who actually engaged this month. Only `this_month` / `this_week` timeframes exist from v20 on —
 * `last_30_days` is rejected with error #100 (verified).
 */
export async function getEngagedAudienceDemographics(
  instagramBusinessId: string,
  breakdown: DemographicBreakdown
): Promise<InstagramInsightsResponse> {
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric: "engaged_audience_demographics",
    period: "lifetime",
    metric_type: "total_value",
    breakdown,
    timeframe: "this_month",
  });
}

/**
 * Hourly count of followers online, one 24-hour block per day for (up to) the last 30 days.
 * Each block starts at its `end_time`, which Meta anchors to midnight US Pacific time (07:00 or
 * 08:00 UTC depending on daylight saving — verified), and hour keys "0".."23" count forward from
 * that instant. Converting to IST therefore has to go through the real end_time, never a fixed
 * offset.
 */
export async function getOnlineFollowers(
  instagramBusinessId: string,
  sinceUnix: number,
  untilUnix: number
): Promise<InstagramInsightsResponse> {
  assertWithinInsightsWindow(sinceUnix, untilUnix);
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric: "online_followers",
    period: "lifetime",
    since: String(sinceUnix),
    until: String(untilUnix),
  });
}

/**
 * reach, views, total_interactions and likes, each split by where it happened
 * (media_product_type: AD, REEL, POST, CAROUSEL_CONTAINER, STORY, ...). Verified as one combined
 * request. This is what separates paid (AD) from organic activity — the account totals elsewhere
 * include ads.
 */
export async function getActivityBySurface(
  instagramBusinessId: string,
  sinceUnix: number,
  untilUnix: number
): Promise<InstagramInsightsResponse> {
  assertWithinInsightsWindow(sinceUnix, untilUnix);
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric: "reach,views,total_interactions,likes",
    period: "day",
    metric_type: "total_value",
    breakdown: "media_product_type",
    since: String(sinceUnix),
    until: String(untilUnix),
  });
}

/** reach and views split into FOLLOWER / NON_FOLLOWER (and a small UNKNOWN). */
export async function getActivityByFollowType(
  instagramBusinessId: string,
  sinceUnix: number,
  untilUnix: number
): Promise<InstagramInsightsResponse> {
  assertWithinInsightsWindow(sinceUnix, untilUnix);
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric: "reach,views",
    period: "day",
    metric_type: "total_value",
    breakdown: "follow_type",
    since: String(sinceUnix),
    until: String(untilUnix),
  });
}

/** Daily reach and follower_count (time series). follower_count only covers the last 30 days. */
export async function getDailyReachAndFollowers(
  instagramBusinessId: string,
  sinceUnix: number,
  untilUnix: number
): Promise<InstagramInsightsResponse> {
  assertWithinInsightsWindow(sinceUnix, untilUnix);
  return graphGet<InstagramInsightsResponse>(`${instagramBusinessId}/insights`, {
    metric: "reach,follower_count",
    period: "day",
    metric_type: "time_series",
    since: String(sinceUnix),
    until: String(untilUnix),
  });
}

/** Story taps: tap_forward, tap_back, tap_exit, swipe_forward (verified). */
export async function getStoryNavigationBreakdown(storyId: string): Promise<InstagramInsightsResponse> {
  return graphGet<InstagramInsightsResponse>(`${storyId}/insights`, {
    metric: "navigation",
    breakdown: "story_navigation_action_type",
  });
}

export interface InstagramComment {
  id: string;
  text?: string;
  timestamp: string;
  like_count?: number;
  /** Replies on the comment, including the account's own. Commenter usernames are NOT returned
   *  for this token (verified), so none are requested or shown. */
  replies?: { data: Array<{ id: string; timestamp?: string }> };
}

export interface InstagramCommentsPage {
  data: InstagramComment[];
  paging?: InstagramPaging;
}

/** Top-level comments on one post (newest first), with reply ids so "answered" can be derived. */
export async function getMediaComments(mediaId: string, limit = 50): Promise<InstagramCommentsPage> {
  return graphGet<InstagramCommentsPage>(`${mediaId}/comments`, {
    fields: "id,text,timestamp,like_count,replies{id,timestamp}",
    limit: String(Math.min(limit, 50)),
  });
}

export interface TokenDebugInfo {
  data: {
    is_valid: boolean;
    /** Unix seconds; 0 means the token never expires (e.g. a system-user token). */
    expires_at?: number;
    data_access_expires_at?: number;
  };
}

/** Lets the token inspect itself — no app secret needed (verified with this account's token). */
export async function debugOwnToken(): Promise<TokenDebugInfo> {
  return graphGet<TokenDebugInfo>("debug_token", { input_token: process.env.META_ACCESS_TOKEN ?? "" });
}

export interface BusinessDiscoveryResponse {
  business_discovery?: {
    username?: string;
    name?: string;
    followers_count?: number;
    media_count?: number;
    profile_picture_url?: string;
    media?: { data: Array<{ id: string; like_count?: number; comments_count?: number; timestamp: string; media_product_type?: string }> };
  };
}

/**
 * Public stats for another Instagram business/creator account (verified against our own
 * username). Fails for personal accounts. `username` is validated by the caller.
 */
export async function getBusinessDiscovery(
  instagramBusinessId: string,
  username: string
): Promise<BusinessDiscoveryResponse> {
  return graphGet<BusinessDiscoveryResponse>(instagramBusinessId, {
    fields: `business_discovery.username(${username}){username,name,followers_count,media_count,profile_picture_url,media.limit(24){like_count,comments_count,timestamp,media_product_type}}`,
  });
}
