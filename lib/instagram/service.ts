// Data orchestration layer. This is the ONLY module that decides what to fetch, which date
// windows to use, which requests run in parallel, how multiple Meta responses get combined, and
// how the result is cached. It calls endpoints.ts directly; normalize.ts and kpis.ts do the shape
// transformation and math. No React component and no route handler should contain any of that
// logic — routes only call the functions exported here.
//
//   Meta Graph API -> client.ts -> endpoints.ts -> service.ts (this file) -> normalize.ts
//   -> kpis.ts -> API routes -> Next.js frontend (later)
//
// No database, no Redis, no AI, no Marketing API calls anywhere in this file.

// Extensions below are required, not stylistic: Node's native ESM loader (used by `npm test`)
// resolves relative specifiers per spec, unlike Next.js's bundler-mode resolution used to run the
// app itself — see normalize.test.ts's note on the same issue. This file is the first one in
// lib/instagram/ that imports actual VALUES (not just `import type`) from sibling modules, so it's
// the first one that needs this.
import { GraphApiError } from "./client.ts";
import {
  getAccount,
  getAccountFollowsAndUnfollows,
  getAccountInsightsTotals,
  getAccountReachTotal,
  getFeedMediaInsights,
  getMedia,
  getReelInsights,
  getStories as fetchStories,
  getStoryInsights as fetchStoryInsights,
} from "./endpoints.ts";
import {
  classifyContentType,
  normalizeAccount,
  normalizeAccountReachTotal,
  normalizeMedia,
  normalizeStory,
} from "./normalize.ts";
import {
  absoluteChange,
  accountEngagementRate,
  buildAccountOverviewKpis,
  buildContentKpi,
  buildStoryKpi,
  buildTrendSeries,
  percentageChange,
  summarizeFollowsAndUnfollows,
  type AccountOverviewKpis,
  type ContentKpi,
  type StoryKpi,
  type TrendPoint,
} from "./kpis.ts";
import { instagramCache, CACHE_TTL_MS } from "./cache.ts";
import {
  InvalidDateRangeError,
  chunkDateRangeForInsights,
  dateRangeToUnixWindow,
  lastMonth,
  lastNCalendarMonths,
  thisMonth,
  validateDateRange,
  type DateRange,
} from "./dateRange.ts";
import type { InstagramAccountNormalized, InstagramBreakdownMetric, InstagramMedia, MetricValue } from "./types.ts";

// ============================================================================
// Errors — pure, directly testable without touching Meta.
// ============================================================================

export interface ApiErrorShape {
  ok: false;
  error: string;
  metaErrorType: string | null;
  metaErrorCode: number | null;
  /** True only for Meta error code 190 (expired/invalid access token) — lets the frontend show a
   *  specific, actionable message instead of Meta's raw error text. False for every other error. */
  isTokenError: boolean;
}

/** Converts any thrown error into the clean shape every API route returns — the frontend never
 *  needs to know about GraphApiError, InvalidDateRangeError, or anything Meta-specific. */
export function toApiError(err: unknown): ApiErrorShape {
  if (err instanceof GraphApiError) {
    return {
      ok: false,
      error: err.message,
      metaErrorType: err.type ?? null,
      metaErrorCode: err.code ?? null,
      isTokenError: err.isTokenError,
    };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Unexpected server error",
    metaErrorType: null,
    metaErrorCode: null,
    isTokenError: false,
  };
}

/** The HTTP status a route should respond with for a given error. */
export function apiErrorStatus(err: unknown): number {
  if (err instanceof GraphApiError) {
    return err.status >= 400 && err.status < 600 ? err.status : 502;
  }
  if (err instanceof InvalidDateRangeError) return 400;
  return 500;
}

// ============================================================================
// Partial-result contract (section 16) — used by content/reels/stories, where one item's insights
// failing must not discard everything else.
// ============================================================================

export interface ItemError {
  id: string;
  message: string;
}

export interface PartialListResult<T> {
  data: T[];
  warnings: string[];
  errors: ItemError[];
}

// ============================================================================
// Pure combining helpers — exported so tests can exercise them directly with fixture data,
// without mocking Meta or the endpoint layer at all.
// ============================================================================

/** Null-safe sum: null if ANY input is null (never treats missing as zero — see kpis.ts's
 *  identical rule). Used only to combine a metric across non-overlapping date chunks. */
function sumMetricValues(...values: readonly MetricValue[]): MetricValue {
  if (values.some((v) => v === null)) return null;
  return (values as number[]).reduce((total, v) => total + v, 0);
}

function combineFollowsAndUnfollows(entries: readonly InstagramBreakdownMetric[]): InstagramBreakdownMetric[] {
  if (entries.length === 0) return [];
  const totalsByDimension = new Map<string, MetricValue>();

  for (const entry of entries) {
    for (const v of entry.values) {
      const existing = totalsByDimension.has(v.dimension) ? totalsByDimension.get(v.dimension) : undefined;
      totalsByDimension.set(v.dimension, existing === undefined ? v.value : sumMetricValues(existing, v.value));
    }
  }

  return [
    {
      metric: "follows_and_unfollows",
      breakdown: entries[0].breakdown,
      values: Array.from(totalsByDimension.entries()).map(([dimension, value]) => ({ dimension, value })),
    },
  ];
}

/**
 * Combines multiple InstagramAccountNormalized objects — one per <=30-day chunk covering a single
 * larger requested range — into one. Only ever called when a range needed more than one chunk.
 *
 * - Profile fields (id, username, followersCount, ...): taken from the FIRST chunk. All chunks
 *   were normalized against the same single getAccount() snapshot, so every chunk carries an
 *   identical value here — there's nothing to combine.
 * - metrics (profileViews, websiteClicks, views, accountsEngaged, totalInteractions, likes,
 *   comments, shares, saves, replies): summed across chunks. Each is a flow/incremental metric
 *   collected independently per window (see kpis.ts's periodTotal docs) — safe to sum across
 *   non-overlapping windows, unlike reach.
 * - dailyMetrics: concatenated, then de-duplicated by (metric, date) defensively — chunks are
 *   non-overlapping by construction of chunkDateRangeForInsights, so duplicates aren't expected,
 *   but this guarantees no duplicate daily dates even if that assumption is ever violated.
 * - followsAndUnfollows: summed per dimension (also a flow metric, safe to sum).
 * - window: the ORIGINAL requested range, not any individual chunk's range.
 */
export function combineAccountChunks(
  chunks: readonly InstagramAccountNormalized[],
  requestedRange: DateRange
): InstagramAccountNormalized {
  if (chunks.length === 0) {
    throw new Error("combineAccountChunks requires at least one chunk");
  }
  const first = chunks[0];

  const metrics = {
    profileViews: sumMetricValues(...chunks.map((c) => c.metrics.profileViews)),
    websiteClicks: sumMetricValues(...chunks.map((c) => c.metrics.websiteClicks)),
    views: sumMetricValues(...chunks.map((c) => c.metrics.views)),
    accountsEngaged: sumMetricValues(...chunks.map((c) => c.metrics.accountsEngaged)),
    totalInteractions: sumMetricValues(...chunks.map((c) => c.metrics.totalInteractions)),
    likes: sumMetricValues(...chunks.map((c) => c.metrics.likes)),
    comments: sumMetricValues(...chunks.map((c) => c.metrics.comments)),
    shares: sumMetricValues(...chunks.map((c) => c.metrics.shares)),
    saves: sumMetricValues(...chunks.map((c) => c.metrics.saves)),
    replies: sumMetricValues(...chunks.map((c) => c.metrics.replies)),
  };

  const seenDailyKeys = new Set<string>();
  const dailyMetrics = chunks
    .flatMap((c) => c.dailyMetrics)
    .filter((point) => {
      const key = `${point.metric}|${point.date}`;
      if (seenDailyKeys.has(key)) return false;
      seenDailyKeys.add(key);
      return true;
    });

  return {
    id: first.id,
    username: first.username,
    name: first.name,
    profilePictureUrl: first.profilePictureUrl,
    followersCount: first.followersCount,
    mediaCount: first.mediaCount,
    window: requestedRange,
    metrics,
    dailyMetrics,
    followsAndUnfollows: combineFollowsAndUnfollows(chunks.flatMap((c) => c.followsAndUnfollows)),
  };
}

/** Turns Promise.allSettled results into the {data, warnings, errors} contract. `getId`/`getError`
 *  let callers control how an item's id and failure message are derived. */
export function buildPartialResult<Source, Normalized, Kpi>(
  sourceItems: readonly Source[],
  settled: readonly PromiseSettledResult<Normalized>[],
  toKpi: (normalized: Normalized) => Kpi,
  getId: (source: Source, index: number) => string,
  extraWarnings: readonly string[] = []
): PartialListResult<Kpi> {
  const data: Kpi[] = [];
  const errors: ItemError[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      data.push(toKpi(result.value));
    } else {
      const message = result.reason instanceof Error ? result.reason.message : "Unknown error";
      errors.push({ id: getId(sourceItems[index], index), message });
    }
  });

  return { data, warnings: [...extraWarnings], errors };
}

// ============================================================================
// Section: account data fetching + chunking + the reach-accuracy policy.
// ============================================================================

/**
 * Whether an accurate, Meta-computed period reach can be obtained for a range that's already been
 * split into `chunks`: only when it fits in exactly one <=30-day chunk. See AccountRangeData's
 * docs for why more than one chunk means null rather than a summed approximation.
 */
export function shouldComputeAccuratePeriodReach(chunks: readonly DateRange[]): boolean {
  return chunks.length === 1;
}

export interface AccountRangeData {
  account: InstagramAccountNormalized;
  /**
   * A single Meta-computed, deduplicated reach number for `range` — ONLY when `range` fit in one
   * <=30-day chunk. When the range needed multiple chunks, this is null: summing multiple
   * accurate per-chunk reach totals would reintroduce the exact double-counting problem across
   * chunk boundaries that summing daily values has, so no number is reported at all rather than a
   * misleading one (see the Prompt 6 report, "Reach methodology").
   */
  periodReach: MetricValue;
  chunkCount: number;
}

/**
 * Fetches and combines everything buildAccountOverviewKpis/accountEngagementRate need for one
 * date range: the account profile (fetched once, unchunked — it's a snapshot), each chunk's
 * totals + follows_and_unfollows (fetched in parallel across chunks), and — only when the whole
 * range fits in a single chunk — the accurate period-level reach total.
 */
async function fetchAccountDataForRange(
  instagramBusinessId: string,
  range: DateRange
): Promise<AccountRangeData> {
  validateDateRange(range);
  const chunks = chunkDateRangeForInsights(range);

  const accountPromise = getAccount(instagramBusinessId);

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const { sinceUnix, untilUnix } = dateRangeToUnixWindow(chunk);
      const [totals, follows] = await Promise.all([
        getAccountInsightsTotals(instagramBusinessId, sinceUnix, untilUnix),
        getAccountFollowsAndUnfollows(instagramBusinessId, sinceUnix, untilUnix),
      ]);
      return { chunk, totals, follows };
    })
  );

  const account = await accountPromise;

  const normalizedChunks = chunkResults.map(({ chunk, totals, follows }) =>
    normalizeAccount({ account, totals, followsAndUnfollows: follows, window: chunk })
  );

  const combinedAccount =
    normalizedChunks.length === 1 ? normalizedChunks[0] : combineAccountChunks(normalizedChunks, range);

  let periodReach: MetricValue = null;
  if (shouldComputeAccuratePeriodReach(chunks)) {
    const { sinceUnix, untilUnix } = dateRangeToUnixWindow(chunks[0]);
    const reachResponse = await getAccountReachTotal(instagramBusinessId, sinceUnix, untilUnix);
    periodReach = normalizeAccountReachTotal(reachResponse);
  }

  return { account: combinedAccount, periodReach, chunkCount: chunks.length };
}

function engagementRateFor(data: AccountRangeData): MetricValue {
  const { metrics } = data.account;
  return accountEngagementRate(
    { likes: metrics.likes, comments: metrics.comments, shares: metrics.shares, saves: metrics.saves },
    data.periodReach
  );
}

// ============================================================================
// Section 6 — Account overview.
// ============================================================================

export interface OverviewResponse extends AccountOverviewKpis {
  dateRange: DateRange;
  follows: MetricValue;
  unfollows: MetricValue;
}

/**
 * follower_count's daily-series semantics remain unverified (see kpis.ts's
 * getFollowerCountDailySeries docs) — it is deliberately NOT surfaced anywhere in this response.
 * `follows`/`unfollows` come from the follows_and_unfollows breakdown instead, which is on firmer
 * footing (see summarizeFollowsAndUnfollows).
 */
export async function getOverview(
  instagramBusinessId: string,
  range: DateRange,
  forceRefresh: boolean = false
): Promise<OverviewResponse> {
  validateDateRange(range);
  const key = `overview:${instagramBusinessId}:${range.since}:${range.until}`;

  return instagramCache.wrap(
    key,
    CACHE_TTL_MS.overview,
    async () => {
      const data = await fetchAccountDataForRange(instagramBusinessId, range);
      const kpis = buildAccountOverviewKpis(data.account, data.periodReach);
      const { newFollows, unfollows } = summarizeFollowsAndUnfollows(data.account.followsAndUnfollows);
      return { dateRange: range, ...kpis, follows: newFollows, unfollows };
    },
    forceRefresh
  );
}

// ============================================================================
// Section 7 / 8 — Media content (Posts, Carousels, Reels) for a date range.
// ============================================================================

const MAX_MEDIA_PAGES = 5;
const MEDIA_PAGE_SIZE = 50;

/**
 * Paginates /media (newest-first, per Meta's default ordering — verified in Prompt 3) and stops
 * as soon as it has gone far enough back to cover `range.since`, rather than blindly walking every
 * page of the account's history. Capped at MAX_MEDIA_PAGES * MEDIA_PAGE_SIZE items as a hard
 * safety valve for very high-volume accounts or very wide ranges; `truncated: true` signals the
 * range may not be fully covered in that case, rather than silently under-reporting.
 *
 * Meta's /media edge has no verified since/until filter for this account (never tested — no
 * assumption is made that it exists), so client-side timestamp filtering + early pagination
 * termination is the only verified-safe way to scope this to a date range.
 */
async function fetchMediaListForRange(
  instagramBusinessId: string,
  range: DateRange
): Promise<{ items: InstagramMedia[]; truncated: boolean }> {
  const { sinceUnix, untilUnix } = dateRangeToUnixWindow(range);
  const items: InstagramMedia[] = [];
  let after: string | undefined;
  let truncated = false;

  for (let page = 0; page < MAX_MEDIA_PAGES; page++) {
    const mediaPage = await getMedia(instagramBusinessId, { limit: MEDIA_PAGE_SIZE, after });
    items.push(...mediaPage.data);

    const oldest = mediaPage.data[mediaPage.data.length - 1];
    const oldestUnix = oldest ? Date.parse(oldest.timestamp) / 1000 : null;
    after = mediaPage.paging?.cursors?.after;

    if (oldestUnix !== null && oldestUnix < sinceUnix) break;
    if (!after) break;
    if (page === MAX_MEDIA_PAGES - 1) truncated = true;
  }

  const inRange = items.filter((item) => {
    const t = Date.parse(item.timestamp) / 1000;
    return t >= sinceUnix && t <= untilUnix;
  });

  return { items: inRange, truncated };
}

/**
 * Fetches the media list once, then one insights call per item — the verified Reel metric set for
 * REELS, the verified Feed metric set for POST/CAROUSEL, and nothing for OTHER (no verified metric
 * set exists for it, so its metrics stay unavailable rather than guessed). Content type is read
 * from normalize.ts's classifyContentType (media_type/media_product_type only — never inferred
 * from captions). Per-item insight failures are isolated via Promise.allSettled: one bad item
 * never discards the rest of the page.
 */
async function fetchClassifiedMediaForRange(
  instagramBusinessId: string,
  range: DateRange
): Promise<PartialListResult<ContentKpi>> {
  const { items, truncated } = await fetchMediaListForRange(instagramBusinessId, range);

  const settled = await Promise.allSettled(
    items.map(async (item) => {
      const contentType = classifyContentType(item.media_type, item.media_product_type);
      const insights =
        contentType === "REEL"
          ? await getReelInsights(item.id)
          : contentType === "POST" || contentType === "CAROUSEL"
            ? await getFeedMediaInsights(item.id)
            : undefined;
      return normalizeMedia(item, insights);
    })
  );

  const warnings = truncated
    ? [`Media list capped at ${MAX_MEDIA_PAGES * MEDIA_PAGE_SIZE} items and may not cover the full requested range.`]
    : [];

  return buildPartialResult(items, settled, buildContentKpi, (item) => item.id, warnings);
}

async function getClassifiedMedia(
  instagramBusinessId: string,
  range: DateRange,
  forceRefresh: boolean = false
): Promise<PartialListResult<ContentKpi>> {
  validateDateRange(range);
  const key = `media:${instagramBusinessId}:${range.since}:${range.until}`;
  return instagramCache.wrap(
    key,
    CACHE_TTL_MS.media,
    () => fetchClassifiedMediaForRange(instagramBusinessId, range),
    forceRefresh
  );
}

function filterByContentType(
  result: PartialListResult<ContentKpi>,
  types: readonly ContentKpi["contentType"][]
): PartialListResult<ContentKpi> {
  return { ...result, data: result.data.filter((item) => types.includes(item.contentType)) };
}

export async function getPosts(instagramBusinessId: string, range: DateRange): Promise<PartialListResult<ContentKpi>> {
  return filterByContentType(await getClassifiedMedia(instagramBusinessId, range), ["POST"]);
}

export async function getCarousels(instagramBusinessId: string, range: DateRange): Promise<PartialListResult<ContentKpi>> {
  return filterByContentType(await getClassifiedMedia(instagramBusinessId, range), ["CAROUSEL"]);
}

export async function getReels(
  instagramBusinessId: string,
  range: DateRange,
  forceRefresh: boolean = false
): Promise<PartialListResult<ContentKpi>> {
  return filterByContentType(await getClassifiedMedia(instagramBusinessId, range, forceRefresh), ["REEL"]);
}

/** Posts + Carousels together from ONE shared, cached media fetch — used by the /content route so
 *  it doesn't pay for two separate media-list fetches when it wants both content types. */
export async function getFeedContent(
  instagramBusinessId: string,
  range: DateRange,
  forceRefresh: boolean = false
): Promise<PartialListResult<ContentKpi>> {
  return filterByContentType(await getClassifiedMedia(instagramBusinessId, range, forceRefresh), ["POST", "CAROUSEL"]);
}

// ============================================================================
// Section 9 — Stories. Currently-available only; no historical archive is possible or attempted.
// ============================================================================

export async function getStories(
  instagramBusinessId: string,
  forceRefresh: boolean = false
): Promise<PartialListResult<StoryKpi>> {
  const key = `stories:${instagramBusinessId}`;

  return instagramCache.wrap(
    key,
    CACHE_TTL_MS.stories,
    async () => {
      const page = await fetchStories(instagramBusinessId);

      const settled = await Promise.allSettled(
        page.data.map(async (story) => {
          const insights = await fetchStoryInsights(story.id);
          return normalizeStory(story, insights);
        })
      );

      return buildPartialResult(page.data, settled, buildStoryKpi, (story) => story.id);
    },
    forceRefresh
  );
}

// ============================================================================
// Section 10 — Three-month trend. "Three" comes from lastNCalendarMonths(3) here, not from any
// assumption baked into kpis.ts's buildTrendSeries (which works for any number of periods).
// ============================================================================

export interface TrendResponse {
  periods: string[];
  reach: TrendPoint[];
  views: TrendPoint[];
  engagementRate: TrendPoint[];
  likes: TrendPoint[];
  comments: TrendPoint[];
  shares: TrendPoint[];
  saves: TrendPoint[];
  /** Included because follows_and_unfollows is on firmer semantic footing than follower_count —
   *  see summarizeFollowsAndUnfollows. There is deliberately no "followers over time" trend here. */
  newFollows: TrendPoint[];
  unfollows: TrendPoint[];
}

/**
 * Each month is fetched via fetchAccountDataForRange independently, so each gets its own
 * chunking and its own reach-accuracy decision. A 31-day calendar month (Jan/Mar/May/Jul/Aug/
 * Oct/Dec) needs 2 chunks on its own and therefore reports periodReach: null for that month, while
 * a 28-30 day month reports an accurate number — this is a real, Meta-imposed inconsistency
 * across months in the trend, not a bug (see the Prompt 6 report, "Any remaining data limitations").
 */
export async function getThreeMonthTrend(
  instagramBusinessId: string,
  forceRefresh: boolean = false
): Promise<TrendResponse> {
  const key = `trend:${instagramBusinessId}`;

  return instagramCache.wrap(
    key,
    CACHE_TTL_MS.trend,
    async () => {
      const months = lastNCalendarMonths(3);
      const monthData = await Promise.all(
        months.map(async (m) => ({ period: m.period, data: await fetchAccountDataForRange(instagramBusinessId, m.range) }))
      );

      return {
        periods: monthData.map((m) => m.period),
        reach: buildTrendSeries(monthData, (d) => d.periodReach),
        views: buildTrendSeries(monthData, (d) => d.account.metrics.views),
        engagementRate: buildTrendSeries(monthData, engagementRateFor),
        likes: buildTrendSeries(monthData, (d) => d.account.metrics.likes),
        comments: buildTrendSeries(monthData, (d) => d.account.metrics.comments),
        shares: buildTrendSeries(monthData, (d) => d.account.metrics.shares),
        saves: buildTrendSeries(monthData, (d) => d.account.metrics.saves),
        newFollows: buildTrendSeries(monthData, (d) => summarizeFollowsAndUnfollows(d.account.followsAndUnfollows).newFollows),
        unfollows: buildTrendSeries(monthData, (d) => summarizeFollowsAndUnfollows(d.account.followsAndUnfollows).unfollows),
      };
    },
    forceRefresh
  );
}

// ============================================================================
// Section 11 — Month-over-month. Current calendar month is PARTIAL (1st through today); previous
// is COMPLETE. That asymmetry is inherent to "current vs previous calendar month" and is not
// hidden — both dateRanges are included in the response so the frontend can represent it honestly.
// ============================================================================

export interface MetricComparison {
  current: MetricValue;
  previous: MetricValue;
  absoluteChange: MetricValue;
  percentageChange: MetricValue;
}

export interface MoMResponse {
  currentRange: DateRange;
  previousRange: DateRange;
  reach: MetricComparison;
  views: MetricComparison;
  likes: MetricComparison;
  comments: MetricComparison;
  shares: MetricComparison;
  saves: MetricComparison;
  profileViews: MetricComparison;
  websiteClicks: MetricComparison;
  accountsEngaged: MetricComparison;
  engagementRate: MetricComparison;
  followers: MetricComparison;
}

function compare(current: MetricValue, previous: MetricValue): MetricComparison {
  return { current, previous, absoluteChange: absoluteChange(current, previous), percentageChange: percentageChange(current, previous) };
}

export async function getMonthOverMonth(
  instagramBusinessId: string,
  forceRefresh: boolean = false
): Promise<MoMResponse> {
  const currentRange = thisMonth();
  const previousRange = lastMonth();
  const key = `mom:${instagramBusinessId}:${currentRange.since}`;

  return instagramCache.wrap(
    key,
    CACHE_TTL_MS.mom,
    async () => {
      const [current, previous] = await Promise.all([
        fetchAccountDataForRange(instagramBusinessId, currentRange),
        fetchAccountDataForRange(instagramBusinessId, previousRange),
      ]);

      return {
        currentRange,
        previousRange,
        reach: compare(current.periodReach, previous.periodReach),
        views: compare(current.account.metrics.views, previous.account.metrics.views),
        likes: compare(current.account.metrics.likes, previous.account.metrics.likes),
        comments: compare(current.account.metrics.comments, previous.account.metrics.comments),
        shares: compare(current.account.metrics.shares, previous.account.metrics.shares),
        saves: compare(current.account.metrics.saves, previous.account.metrics.saves),
        profileViews: compare(current.account.metrics.profileViews, previous.account.metrics.profileViews),
        websiteClicks: compare(current.account.metrics.websiteClicks, previous.account.metrics.websiteClicks),
        accountsEngaged: compare(current.account.metrics.accountsEngaged, previous.account.metrics.accountsEngaged),
        engagementRate: compare(engagementRateFor(current), engagementRateFor(previous)),
        followers: compare(current.account.followersCount, previous.account.followersCount),
      };
    },
    forceRefresh
  );
}
