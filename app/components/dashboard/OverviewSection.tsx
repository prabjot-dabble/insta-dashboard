import type { FetchState } from "@/app/lib/useApiData";
import { formatCompact, formatDayRange, formatInteger, formatPercent, formatSignedInteger } from "@/app/lib/format";
import type { MetricValue, OverviewData, OverviewPeriod } from "@/app/lib/types";
import { KpiBreakdownStrip, KpiHeroRow, KpiSecondaryRow, type KpiItem } from "./Kpi";
import { SkeletonKpiHero, SkeletonKpiRow } from "./Skeletons";
import { ErrorNotice } from "./StatusNotices";
import { SectionHeading } from "./SectionHeading";

interface OverviewSectionProps {
  state: FetchState<OverviewData>;
}

/**
 * Every KPI is compared with the comparable earlier period the API returns in `previous` (same
 * days last month for "This Month", the 7 days before for "Last 7 Days", and so on — see
 * lib/instagram/dateRange.ts#previousComparableRange). Deltas only appear when both values exist;
 * nothing is estimated client-side. Followers gets net growth for the period instead, because
 * Meta provides no historical follower count to compare against.
 */
export function OverviewSection({ state }: OverviewSectionProps) {
  return (
    <section id="overview" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading number="01" title="Instagram at a Glance" />

      {state.status === "loading" && (
        <div className="space-y-10">
          <SkeletonKpiHero />
          <SkeletonKpiRow />
        </div>
      )}

      {state.status === "error" && (
        <ErrorNotice sectionLabel="Instagram Overview" detail={state.message} isTokenError={state.isTokenError} />
      )}

      {state.status === "success" && <OverviewContent data={state.data} />}
    </section>
  );
}

type CountKey = Exclude<keyof OverviewPeriod, "dateRange">;

/** Today's date in Asia/Kolkata as "YYYY-MM-DD" — the timezone every date range here uses. */
function todayIst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function OverviewContent({ data }: { data: OverviewData }) {
  // "Today" is still running, and Meta's numbers are per whole day, so there's no fair "same hours
  // yesterday" to compare with. Comparing against all of yesterday would always look like a drop.
  const isTodayOnly = data.dateRange.since === data.dateRange.until && data.dateRange.until === todayIst();
  const prev = isTodayOnly ? null : data.previous;
  const count = (label: string, key: CountKey, format: (v: MetricValue) => string = formatInteger): KpiItem => ({
    label,
    value: format(data[key]),
    ...percentDelta(data[key], prev ? prev[key] : null),
  });

  return (
    <div className="space-y-10">
      {prev && (
        <p className="-mt-4 text-xs text-ink-muted">
          {formatDayRange(data.dateRange)}, compared with {formatDayRange(prev.dateRange)}. Totals include promoted (ad)
          activity. See{" "}
          <a href="#discovery" className="underline underline-offset-2 hover:text-accent">
            Reach &amp; Discovery
          </a>{" "}
          for organic only.
        </p>
      )}
      {isTodayOnly && (
        <p className="-mt-4 text-xs text-ink-muted">Today isn&apos;t over yet, so it isn&apos;t compared with yesterday.</p>
      )}
      <KpiHeroRow
        items={[
          { label: "Followers", value: formatInteger(data.followers), ...followerGrowth(data.follows, data.unfollows) },
          count("Reach", "reach"),
          count("Views", "views", formatCompact),
          {
            label: "Engagement Rate",
            value: formatPercent(data.engagementRate),
            ...pointDelta(data.engagementRate, prev?.engagementRate ?? null),
          },
        ]}
      />
      <KpiSecondaryRow
        items={[
          count("Profile Views", "profileViews"),
          count("Website Clicks", "websiteClicks"),
          count("Accounts Engaged", "accountsEngaged"),
          count("Total Interactions", "totalInteractions"),
        ]}
      />
      <KpiBreakdownStrip
        items={[
          count("Likes", "likes"),
          count("Comments", "comments"),
          count("Shares", "shares"),
          count("Saves", "saves"),
          count("Replies", "replies"),
        ]}
      />
    </div>
  );
}

type Delta = Pick<KpiItem, "delta" | "direction" | "note">;

function directionOf(change: number): KpiItem["direction"] {
  return change > 0 ? "up" : change < 0 ? "down" : "flat";
}

function arrow(change: number): string {
  return change > 0 ? "▲ " : change < 0 ? "▼ " : "";
}

/** "▲ 12.4%" against the comparable period. Omitted when either value is missing or the earlier
 *  one is zero (a percentage change from zero has no meaning). */
function percentDelta(current: MetricValue, previous: MetricValue): Delta {
  if (current === null || previous === null || previous === 0) return {};
  const change = ((current - previous) / previous) * 100;
  return { delta: `${arrow(change)}${Math.abs(change).toFixed(1)}%`, direction: directionOf(change) };
}

/** Engagement rate is already a percentage, so its change is shown in percentage points. */
function pointDelta(current: MetricValue, previous: MetricValue): Delta {
  if (current === null || previous === null) return {};
  const change = current - previous;
  return { delta: `${arrow(change)}${Math.abs(change).toFixed(2)} pts`, direction: directionOf(change) };
}

/** Net follower change for the selected period, from Meta's follows/unfollows breakdown. */
function followerGrowth(follows: MetricValue, unfollows: MetricValue): Delta {
  if (follows === null || unfollows === null) return {};
  const net = follows - unfollows;
  return {
    delta: `${formatSignedInteger(net)} net this period`,
    direction: directionOf(net),
    note: `${formatInteger(follows)} followed · ${formatInteger(unfollows)} unfollowed`,
  };
}
