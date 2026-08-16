// Deterministic KPI/calculation layer. Consumes ONLY the normalized types from types.ts — no
// fetch(), no process.env, no Meta client, no database. Every exported function here is a pure
// function of its inputs: same input always produces the same output, nothing else observed or
// changed.
//
// Architecture:
//   Meta Graph API -> client.ts -> endpoints.ts -> normalize.ts -> kpis.ts (this file)
//   -> API aggregation (later) -> Dashboard UI (later)
//
// No AI, no generated prose, no "performance improved" style sentences — every function returns
// numbers or structured KPI objects only.

import type {
  InstagramAccountNormalized,
  InstagramBreakdownMetric,
  InstagramContentType,
  InstagramDailyMetric,
  InstagramMediaMetrics,
  InstagramMediaNormalized,
  InstagramReelMetrics,
  InstagramStoryNormalized,
  MetricValue,
} from "./types";

// ============================================================================
// Internal math primitives — not exported. Every KPI formula below is built from these two rules
// so "never null-to-zero" and "never Infinity/NaN" are enforced in exactly one place each.
// ============================================================================

/** Sums the given values. Returns null (not a partial sum) if ANY value is null — see section 14:
 *  converting a missing metric to 0 before summing would misrepresent "unavailable" as "zero". */
function sumOrNull(...values: readonly MetricValue[]): MetricValue {
  if (values.some((v) => v === null)) return null;
  return (values as number[]).reduce((total, v) => total + v, 0);
}

/** numerator/denominator × 100. null if either input is null, or denominator is 0 (never
 *  Infinity/NaN) — a rate cannot mathematically be computed against a zero or missing base. */
function ratioAsPercentage(numerator: MetricValue, denominator: MetricValue): MetricValue {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return (numerator / denominator) * 100;
}

// ============================================================================
// Section 7 / 14 — Month-over-month primitives, and the null/zero contract every other function
// in this file follows.
// ============================================================================

/**
 * Formula: absolute change = current − previous.
 * Null behavior: null if either input is null (nothing to compute).
 * Zero behavior: previous = 0 or current = 0 are both valid numbers here — subtraction is always
 * well-defined, so only missing inputs produce null, never a computed value of 0 itself.
 */
export function absoluteChange(current: MetricValue, previous: MetricValue): MetricValue {
  if (current === null || previous === null) return null;
  return current - previous;
}

/**
 * Formula: percentage change = (current − previous) / previous × 100.
 * Null behavior: null if current or previous is null.
 * Zero behavior: previous = 0 ALWAYS returns null, even if current is also 0 — percentage change
 * from a zero base is mathematically undefined (division by zero), not 0%. This is the one rule
 * in this file that most needs to be applied consistently, since "0 → 5" and "0 → 0" both hit this
 * same undefined case and must both resolve to null, never Infinity/NaN/a fabricated 0%.
 */
export function percentageChange(current: MetricValue, previous: MetricValue): MetricValue {
  if (current === null || previous === null) return null;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ============================================================================
// Section 15 — Rounding. Presentation-only; nothing above or below this line calls it internally.
// ============================================================================

/**
 * Rounds to `decimals` places for DISPLAY only. No KPI calculation in this file rounds its own
 * result — full float precision is preserved internally so the UI can decide "5.3%" vs "5.32%"
 * later. Never chain further math on a rounded value.
 */
export function roundToPrecision(value: MetricValue, decimals: number): MetricValue {
  if (value === null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ============================================================================
// Section 9 — Daily data aggregation. Generic over any metric name; the CALLER decides which
// operation is semantically correct for a given metric (see the per-metric notes below each
// function and in buildAccountOverviewKpis).
// ============================================================================

/**
 * Sums every daily value recorded for `metric`. Correct for incremental/flow metrics collected
 * independently per day (likes, comments, shares, saves, views). INCORRECT for reach: reach
 * counts unique accounts, so an account reached on more than one day within the window gets
 * counted once per day here, overstating true period-unique reach. See
 * buildAccountOverviewKpis for how this tradeoff is surfaced for the account overview's reach
 * figure specifically.
 * Null behavior: null (not 0) when there are zero data points for this metric at all — "no data
 * points" and "data points that summed to zero" must stay distinguishable.
 */
export function periodTotal(dailyMetrics: readonly InstagramDailyMetric[], metric: string): MetricValue {
  const values = dailyMetrics.filter((m) => m.metric === metric).map((m) => m.value);
  if (values.length === 0) return null;
  return sumOrNull(...values);
}

/** Mean of every daily value recorded for `metric`. Same null behavior as periodTotal, and
 *  inherits the same reach caveat — averaging daily reach doesn't fix the double-counting issue,
 *  it just divides it. */
export function periodAverage(dailyMetrics: readonly InstagramDailyMetric[], metric: string): MetricValue {
  const values = dailyMetrics.filter((m) => m.metric === metric).map((m) => m.value);
  if (values.length === 0) return null;
  const total = sumOrNull(...values);
  if (total === null) return null;
  return total / values.length;
}

/**
 * The value from the most recent date recorded for `metric`. Correct for snapshot-style metrics
 * where only the latest point is meaningful, not a sum — e.g. a metric that represents "current
 * state as of that day" rather than "activity that day". Null if there are no data points.
 */
export function latestValue(dailyMetrics: readonly InstagramDailyMetric[], metric: string): MetricValue {
  const points = dailyMetrics.filter((m) => m.metric === metric);
  if (points.length === 0) return null;
  return points.reduce((latest, point) => (point.date >= latest.date ? point : latest)).value;
}

// ============================================================================
// Section 2 / 3 — Engagement rate. Two distinct, explicitly documented formulas: account-level
// uses the account metric named `saves`; media-level uses the media metric named `saved` (see
// endpoints.ts's verified limitation #6 — these are genuinely different Meta field names for
// conceptually the same action, not a typo).
// ============================================================================

export interface AccountInteractionCounts {
  likes: MetricValue;
  comments: MetricValue;
  shares: MetricValue;
  saves: MetricValue;
}

/**
 * Formula: engagement rate = (likes + comments + shares + saves) / reach × 100.
 * Numerator: locally summed from the four named account metrics — deliberately NOT Meta's own
 * `total_interactions` field, which was verified (Prompt 3/5) to include more than these four
 * (e.g. real captured data: likes 914 + comments 14 + shares 282 + saves 362 = 1572, while Meta's
 * own total_interactions for the same window was 1869 — a ~300 gap from components Meta doesn't
 * break out separately). Using the explicit sum keeps this formula's inputs fully transparent.
 * Replies are deliberately excluded per the spec (they aren't the same population as post/story
 * likes-comments-shares-saves) — see the account overview docs for the reach caveat.
 * Denominator: reach, supplied by the caller (see buildAccountOverviewKpis for the documented
 * approximation used when reach comes from summed daily values).
 * Null/zero behavior: null if any of the four numerator components is null (never treated as 0 —
 * section 14), or if reach is null or 0.
 */
export function accountEngagementRate(interactions: AccountInteractionCounts, reach: MetricValue): MetricValue {
  const numerator = sumOrNull(interactions.likes, interactions.comments, interactions.shares, interactions.saves);
  return ratioAsPercentage(numerator, reach);
}

/**
 * Formula: engagement rate = (likes + comments + shares + saved) / reach × 100.
 * Numerator: the media item's own likes/comments/shares/saved (NOT the account-level `saves`).
 * Denominator: the media item's own reach.
 * Null/zero behavior: null if any numerator component is null, or reach is null or 0 — matches
 * accountEngagementRate's rules exactly, just scoped to one media item's own metrics.
 */
export function mediaEngagementRate(metrics: InstagramMediaMetrics): MetricValue {
  const numerator = sumOrNull(metrics.likes, metrics.comments, metrics.shares, metrics.saved);
  return ratioAsPercentage(numerator, metrics.reach);
}

// ============================================================================
// Section 6 — Follower KPIs. `follower_count` (a time-series metric) and `follows_and_unfollows`
// (a breakdown metric) are NOT the same concept and are never mixed together below.
// ============================================================================

/** "Current followers" = the account's followers_count profile field (from getAccount()) — never
 *  anything derived from the follower_count time-series metric (see the ambiguity note below). */
export function currentFollowers(account: InstagramAccountNormalized): MetricValue {
  return account.followersCount;
}

/** Difference between two followers_count snapshots — e.g. today's account object vs. one
 *  captured a month ago by the orchestration layer. This file does no fetching or storing of
 *  those snapshots; it only does the subtraction once both are supplied. */
export function followerChange(current: MetricValue, previous: MetricValue): MetricValue {
  return absoluteChange(current, previous);
}

/** Same null/zero rules as percentageChange: null if either snapshot is null, or previous is 0. */
export function followerGrowthPercent(current: MetricValue, previous: MetricValue): MetricValue {
  return percentageChange(current, previous);
}

/**
 * AMBIGUITY — FLAGGED, NOT RESOLVED (see the Prompt 5 report, section K).
 *
 * Meta's own description for the follower_count time-series metric says "the total number of
 * unique accounts following this profile," which reads as a running total per day. But the real
 * daily values captured from the live Dabble account (38, 52, 49, 40, 50, 0, 0) are far too small
 * to be a running total against an account with ~53,000 actual followers — they look more like a
 * daily net-new-followers delta than a cumulative count, directly contradicting Meta's own field
 * description text.
 *
 * This function does NOT resolve that contradiction. It returns the raw daily points completely
 * unmodified — no sum, no "this is a delta" or "this is a total" interpretation baked in. Use
 * currentFollowers()/followerChange() (built on the unambiguous followers_count snapshot field)
 * for any followers KPI the dashboard actually displays, until this is confirmed one way or the
 * other against Meta's documentation or a longer observation window.
 */
export function getFollowerCountDailySeries(account: InstagramAccountNormalized): InstagramDailyMetric[] {
  return account.dailyMetrics.filter((m) => m.metric === "follower_count");
}

export interface FollowsAndUnfollowsSummary {
  newFollows: MetricValue;
  unfollows: MetricValue;
  netChange: MetricValue;
}

const FOLLOWS_DIMENSION = "FOLLOWER";
const UNFOLLOWS_DIMENSION = "NON_FOLLOWER";

/**
 * Reads Meta's follows_and_unfollows breakdown (the follow_type dimension, values FOLLOWER /
 * NON_FOLLOWER — see endpoints.ts). Mapping FOLLOWER -> newFollows and NON_FOLLOWER -> unfollows
 * is inferred from the metric's own Meta-supplied description ("the number of accounts that
 * followed you and the number that unfollowed you"), not independently confirmed against a
 * second source — flagged in the Prompt 5 report as worth a quick sanity check, though it is a
 * more confident read than the follower_count situation above.
 * Null behavior: a value is null if its dimension isn't present in the breakdown at all — never
 * assumed to be 0. netChange is null unless both newFollows and unfollows are present.
 */
export function summarizeFollowsAndUnfollows(
  breakdown: readonly InstagramBreakdownMetric[]
): FollowsAndUnfollowsSummary {
  const entry = breakdown.find((b) => b.metric === "follows_and_unfollows");
  const newFollows = entry?.values.find((v) => v.dimension === FOLLOWS_DIMENSION)?.value ?? null;
  const unfollows = entry?.values.find((v) => v.dimension === UNFOLLOWS_DIMENSION)?.value ?? null;
  return { newFollows, unfollows, netChange: absoluteChange(newFollows, unfollows) };
}

// ============================================================================
// Section 8 — Trend series. Generic over any number of periods and any metric extractor; this
// file makes no assumption about "three months" anywhere, and performs no Meta calls or date-
// range chunking — the orchestration layer decides which periods to fetch and pairs each with a
// normalized snapshot before calling this.
// ============================================================================

export interface TrendPoint {
  period: string;
  value: MetricValue;
}

/** One period's already-normalized data, labeled by the caller (e.g. "2026-06", or any label the
 *  orchestration layer uses — this file has no opinion on date formatting). */
export interface TrendPeriodInput<T> {
  period: string;
  data: T;
}

/**
 * Applies `extractValue` to each period's data and returns one TrendPoint per period, in the
 * order given. Works for reach, views, engagement rate, followers, likes, comments, shares, saves
 * — whatever `extractValue` computes. Does not sum, average, or otherwise combine periods; each
 * point stands alone.
 */
export function buildTrendSeries<T>(
  periods: readonly TrendPeriodInput<T>[],
  extractValue: (data: T) => MetricValue
): TrendPoint[] {
  return periods.map((p) => ({ period: p.period, value: extractValue(p.data) }));
}

// ============================================================================
// Section 11 / 4 — Content KPI objects and per-type performance lists.
// ============================================================================

export interface ContentKpi {
  id: string;
  contentType: InstagramContentType;
  caption: string | null;
  timestamp: string;
  permalink: string | null;
  /** Meta's dedicated thumbnail asset where available — prefer this for display; mediaUrl is a
   *  fallback for content types (e.g. some Feed posts) where Meta doesn't return a thumbnail. */
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  reach: MetricValue;
  views: MetricValue;
  likes: MetricValue;
  comments: MetricValue;
  shares: MetricValue;
  saved: MetricValue;
  totalInteractions: MetricValue;
  engagementRate: MetricValue;
  /** Only populated when contentType is "REEL"; null for every other content type. */
  reelMetrics: InstagramReelMetrics | null;
}

/** Flattens a normalized media item plus its derived engagementRate into one display-ready
 *  object. No metric is recomputed from raw Meta fields here — everything but engagementRate is
 *  a direct pass-through of what normalize.ts already produced. */
export function buildContentKpi(media: InstagramMediaNormalized): ContentKpi {
  const { id, caption, timestamp, permalink, thumbnailUrl, mediaUrl, contentType, metrics } = media;
  return {
    id,
    contentType,
    caption,
    timestamp,
    permalink,
    thumbnailUrl,
    mediaUrl,
    ...metrics,
    engagementRate: mediaEngagementRate(metrics),
    reelMetrics: media.contentType === "REEL" ? media.reelMetrics : null,
  };
}

export interface StoryKpi {
  id: string;
  timestamp: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  views: MetricValue;
  reach: MetricValue;
  replies: MetricValue;
  follows: MetricValue;
  profileVisits: MetricValue;
  navigation: MetricValue;
}

/**
 * Deliberately has NO engagementRate field. Stories do not expose likes/comments/shares/saved in
 * Meta's insight vocabulary at all (verified in Prompt 3: Story insights are reach, replies,
 * follows, profile_visits, navigation, views only) — the engagement-rate formula from sections
 * 2/3 has no valid inputs for a Story, and no alternate formula was specified. Rather than invent
 * one, this returns the Story's own available metrics only. See the Prompt 5 report's ambiguity
 * section.
 */
export function buildStoryKpi(story: InstagramStoryNormalized): StoryKpi {
  const { id, timestamp, permalink, thumbnailUrl, mediaUrl, metrics } = story;
  return { id, timestamp, permalink, thumbnailUrl, mediaUrl, ...metrics };
}

export function buildPostsPerformance(items: readonly InstagramMediaNormalized[]): ContentKpi[] {
  return items.map(buildContentKpi);
}

export function buildCarouselsPerformance(items: readonly InstagramMediaNormalized[]): ContentKpi[] {
  return items.map(buildContentKpi);
}

export function buildReelsPerformance(items: readonly InstagramMediaNormalized[]): ContentKpi[] {
  return items.map(buildContentKpi);
}

export function buildStoriesPerformance(items: readonly InstagramStoryNormalized[]): StoryKpi[] {
  return items.map(buildStoryKpi);
}

// ============================================================================
// Section 5 — Best/lowest ranking. PRIMARY: engagement rate. SECONDARY (tiebreaker): reach.
// Items whose primary metric is null are excluded from ranking entirely — null is never treated
// as if it were zero (section 14), which would make an item with no data look like the worst
// (or, for "lowest", incorrectly win as if 0 engagement were a real observed value).
// ============================================================================

function pickBestByMetric<T>(
  items: readonly T[],
  getMetric: (item: T) => MetricValue,
  getTiebreaker: (item: T) => MetricValue
): T | null {
  const eligible = items.filter((item) => getMetric(item) !== null);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, item) => {
    const bestMetric = getMetric(best) as number;
    const itemMetric = getMetric(item) as number;
    if (itemMetric > bestMetric) return item;
    if (itemMetric < bestMetric) return best;
    const bestTie = getTiebreaker(best);
    const itemTie = getTiebreaker(item);
    if (itemTie !== null && (bestTie === null || itemTie > bestTie)) return item;
    return best;
  });
}

function pickLowestByMetric<T>(
  items: readonly T[],
  getMetric: (item: T) => MetricValue,
  getTiebreaker: (item: T) => MetricValue
): T | null {
  const eligible = items.filter((item) => getMetric(item) !== null);
  if (eligible.length === 0) return null;
  return eligible.reduce((lowest, item) => {
    const lowestMetric = getMetric(lowest) as number;
    const itemMetric = getMetric(item) as number;
    if (itemMetric < lowestMetric) return item;
    if (itemMetric > lowestMetric) return lowest;
    const lowestTie = getTiebreaker(lowest);
    const itemTie = getTiebreaker(item);
    if (itemTie !== null && (lowestTie === null || itemTie < lowestTie)) return item;
    return lowest;
  });
}

/** Highest engagementRate wins; ties broken by highest reach. Filters defensively to POST items
 *  in case a mixed content-type list is passed in. */
export function bestPost(items: readonly ContentKpi[]): ContentKpi | null {
  return pickBestByMetric(items.filter((i) => i.contentType === "POST"), (i) => i.engagementRate, (i) => i.reach);
}

/** Lowest valid engagementRate wins; ties broken by lowest reach. */
export function lowestPost(items: readonly ContentKpi[]): ContentKpi | null {
  return pickLowestByMetric(items.filter((i) => i.contentType === "POST"), (i) => i.engagementRate, (i) => i.reach);
}

export function bestCarousel(items: readonly ContentKpi[]): ContentKpi | null {
  return pickBestByMetric(items.filter((i) => i.contentType === "CAROUSEL"), (i) => i.engagementRate, (i) => i.reach);
}

export function lowestCarousel(items: readonly ContentKpi[]): ContentKpi | null {
  return pickLowestByMetric(items.filter((i) => i.contentType === "CAROUSEL"), (i) => i.engagementRate, (i) => i.reach);
}

export function bestReel(items: readonly ContentKpi[]): ContentKpi | null {
  return pickBestByMetric(items.filter((i) => i.contentType === "REEL"), (i) => i.engagementRate, (i) => i.reach);
}

export function lowestReel(items: readonly ContentKpi[]): ContentKpi | null {
  return pickLowestByMetric(items.filter((i) => i.contentType === "REEL"), (i) => i.engagementRate, (i) => i.reach);
}

/**
 * Stories cannot be ranked by engagementRate (StoryKpi has no such field — see buildStoryKpi).
 * PRIMARY here is reach instead, SECONDARY is views — the closest available proxy pair, not an
 * invented engagement formula. Only ever ranks among the stories actually passed in, which
 * (per normalizeStory) are only ever the currently-active ones Meta returns right now — there is
 * no historical Story archive to rank against.
 */
export function bestStory(items: readonly StoryKpi[]): StoryKpi | null {
  return pickBestByMetric(items, (i) => i.reach, (i) => i.views);
}

export function lowestStory(items: readonly StoryKpi[]): StoryKpi | null {
  return pickLowestByMetric(items, (i) => i.reach, (i) => i.views);
}

// ============================================================================
// Section 1 / 10 — Account overview aggregation.
// ============================================================================

export interface AccountOverviewKpis {
  followers: MetricValue;
  reach: MetricValue;
  views: MetricValue;
  profileViews: MetricValue;
  websiteClicks: MetricValue;
  accountsEngaged: MetricValue;
  totalInteractions: MetricValue;
  likes: MetricValue;
  comments: MetricValue;
  shares: MetricValue;
  saves: MetricValue;
  replies: MetricValue;
  engagementRate: MetricValue;
}

/**
 * `followers` is the unambiguous followers_count profile snapshot (see currentFollowers).
 *
 * `reach` is NOT computed in here — it must be supplied by the caller as `periodReach`.
 *
 * REVISION (Prompt 6, "IMPORTANT REACH CORRECTION"): this function used to compute reach itself
 * via periodTotal(dailyMetrics, "reach") — summing the daily time-series. That was a documented
 * approximation, not Meta's true deduplicated reach: reach counts unique accounts, so summing
 * daily values double-counts anyone reached on more than one day. Meta does expose a
 * metric_type=total_value form of reach that returns one accurate number for a <=30-day window
 * (endpoints.ts#getAccountReachTotal, added in Prompt 6) — the orchestration layer now fetches
 * that when possible and passes the result in here directly. When the requested period exceeds 30
 * days, no single accurate Meta number exists for it at all (even summing multiple accurate
 * 30-day chunks reintroduces the same cross-chunk double-counting) — the orchestration layer
 * passes `null` in that case rather than any summed approximation, and this function simply
 * forwards whatever it's given. It no longer decides how to obtain reach; it only decides how to
 * use it.
 *
 * `engagementRate` uses `periodReach` and the account's own likes/comments/shares/saves (not
 * Meta's total_interactions field) — see accountEngagementRate's docs for why.
 *
 * Every other field is a direct pass-through of account.metrics (all already total_value-shaped,
 * no aggregation ambiguity).
 */
export function buildAccountOverviewKpis(
  account: InstagramAccountNormalized,
  periodReach: MetricValue
): AccountOverviewKpis {
  const { metrics } = account;

  return {
    followers: account.followersCount,
    reach: periodReach,
    views: metrics.views,
    profileViews: metrics.profileViews,
    websiteClicks: metrics.websiteClicks,
    accountsEngaged: metrics.accountsEngaged,
    totalInteractions: metrics.totalInteractions,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    saves: metrics.saves,
    replies: metrics.replies,
    engagementRate: accountEngagementRate(
      { likes: metrics.likes, comments: metrics.comments, shares: metrics.shares, saves: metrics.saves },
      periodReach
    ),
  };
}
