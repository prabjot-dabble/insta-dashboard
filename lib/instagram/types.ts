// Raw/endpoint-level Instagram Graph API types. These mirror the actual API response shapes
// (verified against the real Dabble account on v25.0) — not the dashboard's final DTOs. Shaping
// data for the UI belongs to the normalization phase, not here.

export interface InstagramAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
}

// media_type is the underlying content format; media_product_type is how it was published.
// A CAROUSEL_ALBUM's media_product_type is "FEED", same as a single image/video feed post —
// media_type is what actually distinguishes a carousel from a single-item feed post.
export type InstagramMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
export type InstagramMediaProductType = "FEED" | "REELS" | "STORY";

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: InstagramMediaType;
  media_product_type?: InstagramMediaProductType;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
  username?: string;
}

export interface InstagramPagingCursors {
  before?: string;
  after?: string;
}

export interface InstagramPaging {
  cursors?: InstagramPagingCursors;
  next?: string;
  previous?: string;
}

export interface InstagramMediaPage {
  data: InstagramMedia[];
  paging?: InstagramPaging;
}

export interface InstagramInsightValue {
  value: number;
  end_time?: string;
}

export interface InstagramInsightBreakdownResult {
  dimension_values: string[];
  value: number;
}

export interface InstagramInsightBreakdown {
  dimension_keys: string[];
  results: InstagramInsightBreakdownResult[];
}

// total_value is either a plain number (most metrics) or, for metrics queried with a `breakdown`
// param (e.g. follows_and_unfollows + breakdown=follow_type), a set of dimensioned results
// instead of `value`. Both shapes are real — verified against the live account.
export interface InstagramInsightTotalValue {
  value?: number;
  breakdowns?: InstagramInsightBreakdown[];
}

export interface InstagramInsight {
  name: string;
  period: string;
  title?: string;
  description?: string;
  // present for metric_type=time_series
  values?: InstagramInsightValue[];
  // present for metric_type=total_value
  total_value?: InstagramInsightTotalValue;
  id: string;
}

export interface InstagramInsightsResponse {
  data: InstagramInsight[];
  paging?: InstagramPaging;
}

export interface InstagramStory {
  id: string;
  media_type: InstagramMediaType;
  media_product_type: "STORY";
  // Meta doesn't reliably return media_url for every story item (observed on the real account) —
  // treat it as optional and fall back to thumbnail_url for a preview.
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp: string;
}

// ============================================================================
// Normalized / internal types — what lib/instagram/normalize.ts produces.
//
// These are shaped for the dashboard, not for the Graph API. Unlike the raw types above, they are
// not a direct mirror of any single Meta response — normalize.ts merges data pulled from separate
// endpoint calls (e.g. a media item's base fields from getMedia() plus its metrics from a later
// getReelInsights() call) into one object.
//
// No business logic lives in these shapes or in the functions that produce them: no engagement
// rate, no MoM, no rankings. That's the KPI layer's job, consuming these types as input.
// ============================================================================

/**
 * A metric value as reported by Meta. `null` means Meta did not provide this metric (missing from
 * the response, request failed, or not yet fetched) — it is NOT the same as an actual `0`, which
 * means Meta explicitly reported zero. Every consumer of a MetricValue must treat null and 0
 * differently; collapsing them would misrepresent "no data" as "confirmed zero activity."
 */
export type MetricValue = number | null;

export interface InstagramDateRange {
  /** Inclusive, "YYYY-MM-DD", UTC calendar date — see normalize.ts's date-handling notes. */
  since: string;
  /** Inclusive, "YYYY-MM-DD", UTC calendar date. */
  until: string;
}

/**
 * One point in an account-level time-series metric (currently: reach, follower_count — the only
 * two metrics Meta accepts as metric_type=time_series for this account, see endpoints.ts).
 * `date` is the UTC calendar date derived from Meta's `end_time` — see normalize.ts.
 */
export interface InstagramDailyMetric {
  date: string;
  metric: string;
  value: MetricValue;
}

/**
 * follows_and_unfollows normalized with its breakdown dimension intact — NOT collapsed into a net
 * follower delta. That interpretation (follows minus unfollows) is a KPI-layer calculation.
 */
export interface InstagramBreakdownMetric {
  metric: string;
  breakdown: string;
  values: Array<{ dimension: string; value: MetricValue }>;
}

/**
 * The account's total_value-shaped metrics for a given window. Deliberately does NOT include
 * `reach` or `followerCount`: both are only available from the verified time_series endpoint call
 * (see endpoints.ts#getAccountInsightsTimeSeries), so representing them here as a single number
 * would require collapsing a daily series into one value — an interpretation choice (sum? latest?
 * average?) left to the KPI layer. They live in InstagramAccountNormalized.dailyMetrics instead.
 */
export interface InstagramAccountMetrics {
  profileViews: MetricValue;
  websiteClicks: MetricValue;
  views: MetricValue;
  accountsEngaged: MetricValue;
  totalInteractions: MetricValue;
  likes: MetricValue;
  comments: MetricValue;
  shares: MetricValue;
  saves: MetricValue;
  replies: MetricValue;
}

export interface InstagramAccountNormalized {
  id: string;
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  /** The window the metrics below were requested for, when known. */
  window: InstagramDateRange | null;
  metrics: InstagramAccountMetrics;
  /** reach + follower_count, one entry per (metric, day) pair Meta actually returned. */
  dailyMetrics: InstagramDailyMetric[];
  followsAndUnfollows: InstagramBreakdownMetric[];
}

/** REELS -> REEL. CAROUSEL_ALBUM -> CAROUSEL. IMAGE/VIDEO feed content -> POST. Anything else -> OTHER. */
export type InstagramContentType = "REEL" | "POST" | "CAROUSEL" | "OTHER";

export interface InstagramMediaMetrics {
  reach: MetricValue;
  views: MetricValue;
  likes: MetricValue;
  comments: MetricValue;
  shares: MetricValue;
  saved: MetricValue;
  totalInteractions: MetricValue;
}

export interface InstagramMediaBaseNormalized {
  id: string;
  caption: string | null;
  /** Preserved verbatim from Meta, not narrowed to the known union — an unrecognized value must
   *  survive normalization (see classifyContentType) rather than being silently discarded. */
  mediaType: string;
  mediaProductType: string | null;
  /** ISO 8601 UTC, exactly as Meta returned it — see normalize.ts's date-handling notes. */
  timestamp: string;
  permalink: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  username: string | null;
  metrics: InstagramMediaMetrics;
}

export interface InstagramPostNormalized extends InstagramMediaBaseNormalized {
  contentType: "POST";
}

export interface InstagramCarouselNormalized extends InstagramMediaBaseNormalized {
  contentType: "CAROUSEL";
}

export interface InstagramReelMetrics {
  averageWatchTime: MetricValue;
  totalVideoViewTime: MetricValue;
  skipRate: MetricValue;
}

export interface InstagramReelNormalized extends InstagramMediaBaseNormalized {
  contentType: "REEL";
  /** Nullable as a whole set: reel insights come from a separate call than the base media fields,
   *  so a Reel normalized without its insights fetched yet has reelMetrics with every field null. */
  reelMetrics: InstagramReelMetrics;
}

export interface InstagramOtherMediaNormalized extends InstagramMediaBaseNormalized {
  contentType: "OTHER";
}

/**
 * One normalized media representation covering every content type, discriminated by
 * `contentType`. This is what section 4/5 of the normalization spec calls for: a single shape
 * that still preserves which kind of content it is.
 */
export type InstagramMediaNormalized =
  | InstagramPostNormalized
  | InstagramCarouselNormalized
  | InstagramReelNormalized
  | InstagramOtherMediaNormalized;

export interface InstagramStoryMetrics {
  views: MetricValue;
  reach: MetricValue;
  replies: MetricValue;
  follows: MetricValue;
  profileVisits: MetricValue;
  navigation: MetricValue;
}

/**
 * Represents a story Meta is CURRENTLY exposing via /stories — never a reconstruction of a story
 * that has already expired. There is no historical archive to normalize against (see
 * normalize.ts#normalizeStory).
 */
export interface InstagramStoryNormalized {
  id: string;
  mediaType: string;
  timestamp: string;
  permalink: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  metrics: InstagramStoryMetrics;
}
