// Client-side mirrors of the backend's API response shapes (lib/instagram/service.ts). These are
// intentionally NOT imported from lib/instagram/ — nothing under app/ imports anything from
// lib/instagram/, even for types, so the server/client boundary stays mechanically obvious rather
// than relying on "it's just a type import, it's erased at build time." The Meta token and every
// Meta-calling function live exclusively server-side, reachable only from the 6 API routes.

export type MetricValue = number | null;

export interface DateRange {
  since: string;
  until: string;
}

export type DateRangePreset = "today" | "yesterday" | "last7days" | "last30days" | "thismonth" | "lastmonth";

export interface ApiError {
  ok: false;
  error: string;
  metaErrorType: string | null;
  metaErrorCode: number | null;
  /** True only when Meta's access token has expired or is invalid (error code 190) — lets the UI
   *  show an actionable message instead of the raw Meta error text. */
  isTokenError: boolean;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

// ---- /api/instagram/overview ----
export interface OverviewData {
  dateRange: DateRange;
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
  follows: MetricValue;
  unfollows: MetricValue;
  engagementRate: MetricValue;
}

// ---- /api/instagram/content, /api/instagram/reels ----
export type ContentType = "REEL" | "POST" | "CAROUSEL" | "OTHER";

export interface ReelMetrics {
  averageWatchTime: MetricValue;
  totalVideoViewTime: MetricValue;
  skipRate: MetricValue;
}

export interface ContentItem {
  id: string;
  contentType: ContentType;
  caption: string | null;
  timestamp: string;
  permalink: string | null;
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
  reelMetrics: ReelMetrics | null;
}

export interface ItemError {
  id: string;
  message: string;
}

export interface PartialListResult<T> {
  data: T[];
  warnings: string[];
  errors: ItemError[];
}

// ---- /api/instagram/stories ----
export interface StoryItem {
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

// ---- /api/instagram/trends ----
export interface TrendPoint {
  period: string;
  value: MetricValue;
}

export interface TrendData {
  periods: string[];
  reach: TrendPoint[];
  views: TrendPoint[];
  engagementRate: TrendPoint[];
  likes: TrendPoint[];
  comments: TrendPoint[];
  shares: TrendPoint[];
  saves: TrendPoint[];
  newFollows: TrendPoint[];
  unfollows: TrendPoint[];
}

// ---- /api/instagram/mom ----
export interface MetricComparison {
  current: MetricValue;
  previous: MetricValue;
  absoluteChange: MetricValue;
  percentageChange: MetricValue;
}

export interface MoMData {
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
