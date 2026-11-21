// Service layer for the dashboard's additional (free) insights: audience, best time to post,
// discovery (organic vs ads, followers vs new people, daily reach), comments, competitor
// benchmarks and token health. Same rules as service.ts: this module decides what to fetch and how
// to cache it; routes only call the async functions at the bottom; the pure helpers in the middle
// do all the shaping and are unit-tested in extras.test.ts without touching Meta.
//
// Every Graph API call used here was verified against the real account first (see endpoints.ts)
// and is free — the only constraint is Meta's hourly rate limit, which the caching below respects.

import {
  debugOwnToken,
  getActivityByFollowType,
  getActivityBySurface,
  getBusinessDiscovery,
  getDailyReachAndFollowers,
  getEngagedAudienceDemographics,
  getFollowerDemographics,
  getMediaComments,
  getOnlineFollowers,
  type DemographicBreakdown,
  type InstagramComment,
} from "./endpoints.ts";
import { instagramCache } from "./cache.ts";
import { chunkDateRangeForInsights, dateRangeToUnixWindow, validateDateRange, type DateRange } from "./dateRange.ts";
import type { InstagramInsight, InstagramInsightsResponse, MetricValue } from "./types.ts";
import type { ContentKpi } from "./kpis.ts";

const HOUR_MS = 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * HOUR_MS;

export const EXTRAS_CACHE_TTL_MS = {
  audience: 6 * HOUR_MS,
  discovery: 5 * 60 * 1000,
  comments: 10 * 60 * 1000,
  token: HOUR_MS,
  competitors: 6 * HOUR_MS,
} as const;

// ============================================================================
// Pure helpers
// ============================================================================

export interface LabelValue {
  label: string;
  value: number;
}

function findInsight(response: InstagramInsightsResponse | undefined, name: string): InstagramInsight | undefined {
  return response?.data?.find((d) => d?.name === name);
}

/** All results of a single-dimension breakdown, as label/value pairs, largest first. */
export function breakdownToList(response: InstagramInsightsResponse | undefined, name: string): LabelValue[] {
  const results = findInsight(response, name)?.total_value?.breakdowns?.[0]?.results ?? [];
  return results
    .filter((r) => typeof r?.value === "number" && Array.isArray(r.dimension_values))
    .map((r) => ({ label: String(r.dimension_values[0]), value: r.value as number }))
    .sort((a, b) => b.value - a.value);
}

/** total_value.value for a metric, or null if Meta didn't return one. */
export function totalOf(response: InstagramInsightsResponse | undefined, name: string): MetricValue {
  const v = findInsight(response, name)?.total_value?.value;
  return typeof v === "number" ? v : null;
}

const GENDER_LABELS: Record<string, string> = { F: "Women", M: "Men", U: "Not specified" };

export function relabelGender(list: LabelValue[]): LabelValue[] {
  return list.map((g) => ({ ...g, label: GENDER_LABELS[g.label] ?? g.label }));
}

/** Age buckets in their natural order rather than by size. */
export function sortAgeBuckets(list: LabelValue[]): LabelValue[] {
  return [...list].sort((a, b) => parseInt(a.label, 10) - parseInt(b.label, 10));
}

/**
 * online_followers -> average followers online for each IST weekday (0 = Monday) and hour.
 * Each daily block's hours count forward from its own end_time (midnight US Pacific), so every
 * hour is converted through a real instant — that keeps daylight-saving shifts correct.
 */
export function buildOnlineHeatmap(response: InstagramInsightsResponse | undefined): number[][] {
  const sums = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

  for (const block of findInsight(response, "online_followers")?.values ?? []) {
    const start = Date.parse(block?.end_time ?? "");
    const hours = block?.value as unknown;
    if (Number.isNaN(start) || !hours || typeof hours !== "object") continue;
    for (const [hourKey, raw] of Object.entries(hours as Record<string, unknown>)) {
      if (typeof raw !== "number") continue;
      const ist = new Date(start + Number(hourKey) * HOUR_MS + IST_OFFSET_MS);
      const weekday = (ist.getUTCDay() + 6) % 7; // Monday first
      const hour = ist.getUTCHours();
      sums[weekday][hour] += raw;
      counts[weekday][hour] += 1;
    }
  }

  return sums.map((row, d) => row.map((sum, h) => (counts[d][h] ? Math.round(sum / counts[d][h]) : 0)));
}

/** The `n` best IST hours of the day, averaged across weekdays. */
export function peakHours(heatmap: number[][], n = 3): number[] {
  const byHour = Array.from({ length: 24 }, (_, h) => heatmap.reduce((s, row) => s + row[h], 0));
  return byHour
    .map((v, h) => ({ v, h }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((x) => x.h)
    .sort((a, b) => a - b);
}

/** Groups Meta's media_product_type values into what a reader recognises. */
const SURFACE_GROUPS: Record<string, string> = {
  AD: "Ads",
  REEL: "Reels",
  POST: "Posts",
  CAROUSEL_CONTAINER: "Carousels",
  CAROUSEL_ITEM: "Carousels",
  STORY: "Stories",
};

export interface SurfaceSplit {
  /** Account total as Meta reports it (includes ads). */
  total: MetricValue;
  /** Sum per surface group. For reach, one person can appear in several groups, so these can add
   *  up to more than `total`; for views/interactions/likes they add up exactly. */
  bySurface: LabelValue[];
  /** Ads' share of the summed surfaces, 0–100, or null with no data. */
  adShare: number | null;
}

export function groupBySurface(list: LabelValue[]): LabelValue[] {
  const grouped = new Map<string, number>();
  for (const { label, value } of list) {
    const group = SURFACE_GROUPS[label] ?? "Other";
    grouped.set(group, (grouped.get(group) ?? 0) + value);
  }
  return [...grouped.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export function surfaceSplit(total: MetricValue, rawList: LabelValue[]): SurfaceSplit {
  const bySurface = groupBySurface(rawList);
  const sum = bySurface.reduce((s, x) => s + x.value, 0);
  const ads = bySurface.find((x) => x.label === "Ads")?.value ?? 0;
  return { total, bySurface, adShare: sum > 0 ? (ads / sum) * 100 : null };
}

/** Adds list values per label across several chunked responses. */
export function sumLists(lists: LabelValue[][]): LabelValue[] {
  const totals = new Map<string, number>();
  for (const list of lists) for (const { label, value } of list) totals.set(label, (totals.get(label) ?? 0) + value);
  return [...totals.entries()].map(([label, value]) => ({ label, value }));
}

export interface DailyPoint {
  /** The day the value describes. Meta stamps each daily bucket with the END of the day
   *  (midnight US Pacific), so the day itself is the calendar date one day before end_time. */
  date: string;
  value: number;
}

export function dailySeries(response: InstagramInsightsResponse | undefined, name: string): DailyPoint[] {
  return (findInsight(response, name)?.values ?? [])
    .filter((p) => typeof p?.value === "number" && typeof p?.end_time === "string")
    .map((p) => ({ date: new Date(Date.parse(p.end_time as string) - 24 * HOUR_MS).toISOString().slice(0, 10), value: p.value as number }));
}

// ---- Comments ----

const QUESTION_PATTERN =
  /\?|\b(price|cost|how much|rate|where|when|available|availability|interested|details|detail|link|order|buy|ship|delivery|age|kit|register|dm)\b/i;

const STOPWORDS = new Set(
  "the and for you your this that with are was have has had but not all can our out get got very just from they them their what will would there here then than its it's too also more most such only into about been were when how who why which i me my we us a an to of in on at is it so be do did done does by or if as no yes ok okay hai hi hello thanks thank please pls".split(
    " "
  )
);

export interface CommentWithPost {
  comment: InstagramComment;
  post: Pick<ContentKpi, "id" | "caption" | "permalink" | "contentType">;
}

export interface CommentSummary {
  postsChecked: number;
  totalComments: number;
  answered: number;
  /** 0–100, or null when there are no comments. */
  answeredRate: number | null;
  questions: number;
  /** Most frequent meaningful words across comments. */
  topWords: LabelValue[];
  /** Newest comments with no reply yet. Text only — Meta doesn't return commenter usernames. */
  unanswered: Array<{ id: string; text: string; timestamp: string; postCaption: string | null; permalink: string | null; isQuestion: boolean }>;
}

export function isQuestion(text: string): boolean {
  return QUESTION_PATTERN.test(text);
}

export function summarizeComments(items: CommentWithPost[], postsChecked: number): CommentSummary {
  const words = new Map<string, number>();
  let answered = 0;
  let questions = 0;

  for (const { comment } of items) {
    if ((comment.replies?.data?.length ?? 0) > 0) answered++;
    const text = comment.text ?? "";
    if (isQuestion(text)) questions++;
    const seen = new Set<string>();
    for (const word of text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []) {
      if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word) || seen.has(word)) continue;
      seen.add(word);
      words.set(word, (words.get(word) ?? 0) + 1);
    }
  }

  const unanswered = items
    .filter(({ comment }) => (comment.replies?.data?.length ?? 0) === 0 && (comment.text ?? "").trim() !== "")
    .sort((a, b) => Date.parse(b.comment.timestamp) - Date.parse(a.comment.timestamp))
    .slice(0, 10)
    .map(({ comment, post }) => ({
      id: comment.id,
      text: comment.text as string,
      timestamp: comment.timestamp,
      postCaption: post.caption,
      permalink: post.permalink,
      isQuestion: isQuestion(comment.text ?? ""),
    }));

  return {
    postsChecked,
    totalComments: items.length,
    answered,
    answeredRate: items.length ? (answered / items.length) * 100 : null,
    questions,
    topWords: [...words.entries()]
      .filter(([, n]) => n > 1)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12),
    unanswered,
  };
}

// ---- Competitors ----

const USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

/** COMPETITOR_USERNAMES="brand_one, @brand_two" -> ["brand_one", "brand_two"]; invalid names dropped. */
export function parseCompetitorUsernames(raw: string | undefined): string[] {
  return [...new Set((raw ?? "").split(",").map((s) => s.trim().replace(/^@/, "")).filter((s) => USERNAME_PATTERN.test(s)))].slice(0, 8);
}

export interface CompetitorStats {
  username: string;
  name: string | null;
  isSelf: boolean;
  followers: MetricValue;
  totalPosts: MetricValue;
  recentPosts: number;
  avgLikes: MetricValue;
  avgComments: MetricValue;
  /** (avg likes + avg comments) / followers × 100 — public-data engagement, comparable across accounts. */
  engagementRate: MetricValue;
  postsPerWeek: MetricValue;
  error: string | null;
}

export function competitorStatsFrom(
  username: string,
  isSelf: boolean,
  bd: NonNullable<import("./endpoints.ts").BusinessDiscoveryResponse["business_discovery"]>
): CompetitorStats {
  const media = bd.media?.data ?? [];
  const avg = (key: "like_count" | "comments_count"): MetricValue => {
    const vals = media.map((m) => m[key]).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const avgLikes = avg("like_count");
  const avgComments = avg("comments_count");
  const followers = typeof bd.followers_count === "number" ? bd.followers_count : null;
  const times = media.map((m) => Date.parse(m.timestamp)).filter((t) => !Number.isNaN(t));
  const spanWeeks = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / (7 * 24 * HOUR_MS) : 0;

  return {
    username: bd.username ?? username,
    name: bd.name ?? null,
    isSelf,
    followers,
    totalPosts: typeof bd.media_count === "number" ? bd.media_count : null,
    recentPosts: media.length,
    avgLikes,
    avgComments,
    engagementRate:
      followers && avgLikes !== null && avgComments !== null ? ((avgLikes + avgComments) / followers) * 100 : null,
    postsPerWeek: spanWeeks > 0 ? (media.length - 1) / spanWeeks : null,
    error: null,
  };
}

// ============================================================================
// Async service functions (cached)
// ============================================================================

export interface AudienceResponse {
  followers: { age: LabelValue[]; gender: LabelValue[]; cities: LabelValue[]; countries: LabelValue[] };
  engagedThisMonth: { age: LabelValue[]; gender: LabelValue[]; cities: LabelValue[] } | null;
  /** [weekday 0=Mon][IST hour] average followers online over the last ~30 days. */
  onlineHeatmap: number[][];
  peakHours: number[];
}

export async function getAudience(instagramBusinessId: string, forceRefresh = false): Promise<AudienceResponse> {
  return instagramCache.wrap(
    `audience:${instagramBusinessId}`,
    EXTRAS_CACHE_TTL_MS.audience,
    async () => {
      const followerCalls = (["age", "gender", "city", "country"] as DemographicBreakdown[]).map((b) =>
        getFollowerDemographics(instagramBusinessId, b)
      );
      const engagedCalls = (["age", "gender", "city"] as DemographicBreakdown[]).map((b) =>
        getEngagedAudienceDemographics(instagramBusinessId, b)
      );
      const now = Math.floor(Date.now() / 1000);
      const [age, gender, city, country, ...rest] = await Promise.all([
        ...followerCalls,
        ...engagedCalls.map((p) => p.catch(() => null)),
        getOnlineFollowers(instagramBusinessId, now - 29 * 86400, now).catch(() => undefined),
      ]);
      const [eAge, eGender, eCity, online] = rest as [
        InstagramInsightsResponse | null,
        InstagramInsightsResponse | null,
        InstagramInsightsResponse | null,
        InstagramInsightsResponse | undefined,
      ];
      const heatmap = buildOnlineHeatmap(online);

      return {
        followers: {
          age: sortAgeBuckets(breakdownToList(age as InstagramInsightsResponse, "follower_demographics")),
          gender: relabelGender(breakdownToList(gender as InstagramInsightsResponse, "follower_demographics")),
          cities: breakdownToList(city as InstagramInsightsResponse, "follower_demographics").slice(0, 10),
          countries: breakdownToList(country as InstagramInsightsResponse, "follower_demographics").slice(0, 8),
        },
        engagedThisMonth:
          eAge && eGender && eCity
            ? {
                age: sortAgeBuckets(breakdownToList(eAge, "engaged_audience_demographics")),
                gender: relabelGender(breakdownToList(eGender, "engaged_audience_demographics")),
                cities: breakdownToList(eCity, "engaged_audience_demographics").slice(0, 8),
              }
            : null,
        onlineHeatmap: heatmap,
        peakHours: peakHours(heatmap),
      };
    },
    forceRefresh
  );
}

export interface DiscoveryResponse {
  dateRange: DateRange;
  reach: SurfaceSplit;
  views: SurfaceSplit;
  interactions: SurfaceSplit;
  /** Followers vs people who don't follow yet. Reach split is null for ranges over 30 days (a
   *  person reached in two chunks would be counted twice). */
  reachByFollow: LabelValue[] | null;
  viewsByFollow: LabelValue[];
  dailyReach: DailyPoint[];
  dailyFollowers: DailyPoint[];
}

export async function getDiscovery(instagramBusinessId: string, range: DateRange, forceRefresh = false): Promise<DiscoveryResponse> {
  validateDateRange(range);
  return instagramCache.wrap(
    `discovery:${instagramBusinessId}:${range.since}:${range.until}`,
    EXTRAS_CACHE_TTL_MS.discovery,
    async () => {
      const chunks = chunkDateRangeForInsights(range);
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const { sinceUnix, untilUnix } = dateRangeToUnixWindow(chunk);
          const [surface, follow, daily] = await Promise.all([
            getActivityBySurface(instagramBusinessId, sinceUnix, untilUnix),
            getActivityByFollowType(instagramBusinessId, sinceUnix, untilUnix),
            getDailyReachAndFollowers(instagramBusinessId, sinceUnix, untilUnix).catch(() => undefined),
          ]);
          return { surface, follow, daily };
        })
      );
      const single = results.length === 1;
      const sumTotals = (name: string): MetricValue => {
        const vals = results.map((r) => totalOf(r.surface, name));
        return vals.some((v) => v === null) ? null : (vals as number[]).reduce((s, v) => s + v, 0);
      };
      const merged = (name: string) => sumLists(results.map((r) => breakdownToList(r.surface, name)));
      const followMerged = (name: string) =>
        sumLists(results.map((r) => breakdownToList(r.follow, name))).sort((a, b) => b.value - a.value);
      // Meta's first daily bucket can straddle the range start (its days run on US Pacific time),
      // so anything dated outside the selected range is dropped rather than shown as an extra day.
      const byDate = (points: DailyPoint[]) =>
        [...new Map(points.map((p) => [p.date, p])).values()]
          .filter((p) => p.date >= range.since && p.date <= range.until)
          .sort((a, b) => a.date.localeCompare(b.date));

      return {
        dateRange: range,
        reach: surfaceSplit(single ? totalOf(results[0].surface, "reach") : null, merged("reach")),
        views: surfaceSplit(sumTotals("views"), merged("views")),
        interactions: surfaceSplit(sumTotals("total_interactions"), merged("total_interactions")),
        reachByFollow: single ? followMerged("reach") : null,
        viewsByFollow: followMerged("views"),
        dailyReach: byDate(results.flatMap((r) => dailySeries(r.daily, "reach"))),
        dailyFollowers: byDate(results.flatMap((r) => dailySeries(r.daily, "follower_count"))),
      };
    },
    forceRefresh
  );
}

const MAX_POSTS_FOR_COMMENTS = 25;

/** Reads comments on the period's posts (newest posts first, capped) and summarises them. */
export async function getCommentsSummary(posts: ContentKpi[], cacheKey: string, forceRefresh = false): Promise<CommentSummary> {
  return instagramCache.wrap(
    `comments:${cacheKey}`,
    EXTRAS_CACHE_TTL_MS.comments,
    async () => {
      const withComments = posts
        .filter((p) => (p.comments ?? 0) > 0)
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
        .slice(0, MAX_POSTS_FOR_COMMENTS);
      const pages = await Promise.allSettled(withComments.map((p) => getMediaComments(p.id)));
      const items: CommentWithPost[] = [];
      pages.forEach((page, i) => {
        if (page.status !== "fulfilled") return;
        const post = withComments[i];
        for (const comment of page.value.data ?? []) {
          items.push({ comment, post: { id: post.id, caption: post.caption, permalink: post.permalink, contentType: post.contentType } });
        }
      });
      return summarizeComments(items, withComments.length);
    },
    forceRefresh
  );
}

export interface TokenStatus {
  isValid: boolean;
  /** ISO date, or null if the token never expires. */
  expiresAt: string | null;
  daysLeft: number | null;
  dataAccessExpiresAt: string | null;
}

export async function getTokenStatus(forceRefresh = false): Promise<TokenStatus> {
  return instagramCache.wrap(
    "token-status",
    EXTRAS_CACHE_TTL_MS.token,
    async () => {
      const { data } = await debugOwnToken();
      const toIso = (s: number | undefined) => (s && s > 0 ? new Date(s * 1000).toISOString() : null);
      const expiresAt = toIso(data?.expires_at);
      return {
        isValid: Boolean(data?.is_valid),
        expiresAt,
        daysLeft: expiresAt ? Math.floor((Date.parse(expiresAt) - Date.now()) / (24 * HOUR_MS)) : null,
        dataAccessExpiresAt: toIso(data?.data_access_expires_at),
      };
    },
    forceRefresh
  );
}

export interface CompetitorsResponse {
  configured: boolean;
  accounts: CompetitorStats[];
}

export async function getCompetitors(
  instagramBusinessId: string,
  ownUsername: string | null,
  forceRefresh = false
): Promise<CompetitorsResponse> {
  const usernames = parseCompetitorUsernames(process.env.COMPETITOR_USERNAMES);
  if (usernames.length === 0) return { configured: false, accounts: [] };

  return instagramCache.wrap(
    `competitors:${instagramBusinessId}:${usernames.join(",")}`,
    EXTRAS_CACHE_TTL_MS.competitors,
    async () => {
      const list = ownUsername ? [ownUsername, ...usernames.filter((u) => u.toLowerCase() !== ownUsername.toLowerCase())] : usernames;
      const settled = await Promise.allSettled(list.map((u) => getBusinessDiscovery(instagramBusinessId, u)));
      const accounts = settled.map((r, i): CompetitorStats => {
        const username = list[i];
        const isSelf = ownUsername !== null && username === ownUsername;
        if (r.status === "fulfilled" && r.value.business_discovery) {
          return competitorStatsFrom(username, isSelf, r.value.business_discovery);
        }
        return {
          username,
          name: null,
          isSelf,
          followers: null,
          totalPosts: null,
          recentPosts: 0,
          avgLikes: null,
          avgComments: null,
          engagementRate: null,
          postsPerWeek: null,
          error: "Not found, or not a business/creator account",
        };
      });
      return { configured: true, accounts };
    },
    forceRefresh
  );
}
