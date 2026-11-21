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
export interface OverviewData extends OverviewPeriod {
  /** Same KPIs for the comparable earlier period; null if it couldn't be fetched. Its followers
   *  value is today's snapshot, not a historical count — never use it for a followers delta. */
  previous: OverviewPeriod | null;
}

export interface OverviewPeriod {
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
  /** Follows and profile visits from this post — feed posts/carousels only (null for Reels;
   *  Meta doesn't offer them there). */
  follows: MetricValue;
  profileVisits: MetricValue;
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
  taps: StoryTaps | null;
}

export interface StoryTaps {
  forward: number;
  back: number;
  exit: number;
  nextStory: number;
}

/** A story saved by the dashboard's local archive after it expired on Instagram. */
export interface ArchivedStory {
  id: string;
  timestamp: string;
  permalink: string | null;
  views: MetricValue;
  reach: MetricValue;
  replies: MetricValue;
  follows: MetricValue;
  profileVisits: MetricValue;
  navigation: MetricValue;
  taps: StoryTaps | null;
  lastSeenAt: string;
}

export interface StoriesData extends PartialListResult<StoryItem> {
  /** Expired stories from the last 30 days that the dashboard saved while they were live. */
  history: ArchivedStory[];
}

// ---- /api/instagram/audience ----
export interface LabelValue {
  label: string;
  value: number;
}

export interface AudienceData {
  followers: { age: LabelValue[]; gender: LabelValue[]; cities: LabelValue[]; countries: LabelValue[] };
  engagedThisMonth: { age: LabelValue[]; gender: LabelValue[]; cities: LabelValue[] } | null;
  /** [weekday 0=Mon][IST hour 0–23] average followers online. */
  onlineHeatmap: number[][];
  peakHours: number[];
}

// ---- /api/instagram/discovery ----
export interface SurfaceSplit {
  total: MetricValue;
  bySurface: LabelValue[];
  adShare: number | null;
}

export interface DailyPoint {
  date: string;
  value: number;
}

export interface DiscoveryData {
  dateRange: DateRange;
  reach: SurfaceSplit;
  views: SurfaceSplit;
  interactions: SurfaceSplit;
  reachByFollow: LabelValue[] | null;
  viewsByFollow: LabelValue[];
  dailyReach: DailyPoint[];
  dailyFollowers: DailyPoint[];
}

// ---- /api/instagram/comments ----
export interface CommentsData {
  postsChecked: number;
  totalComments: number;
  answered: number;
  answeredRate: number | null;
  questions: number;
  topWords: LabelValue[];
  unanswered: Array<{ id: string; text: string; timestamp: string; postCaption: string | null; permalink: string | null; isQuestion: boolean }>;
}

// ---- /api/instagram/token ----
export interface TokenStatus {
  isValid: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
  dataAccessExpiresAt: string | null;
}

// ---- /api/instagram/competitors ----
export interface CompetitorStats {
  username: string;
  name: string | null;
  isSelf: boolean;
  followers: MetricValue;
  totalPosts: MetricValue;
  recentPosts: number;
  avgLikes: MetricValue;
  avgComments: MetricValue;
  engagementRate: MetricValue;
  postsPerWeek: MetricValue;
  error: string | null;
}

export interface CompetitorsData {
  configured: boolean;
  accounts: CompetitorStats[];
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
  /** Months whose reach and engagement rate cover fewer days than the month (Meta's 30-day cap). */
  reachWindows: { period: string; range: DateRange }[];
  /** The current, still-running month — its bars are partial. */
  inProgress: { period: string; daysElapsed: number; daysInMonth: number } | null;
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
