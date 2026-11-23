import type { FetchState } from "@/app/lib/useApiData";
import type { TrendData, TrendPoint } from "@/app/lib/types";
import { formatCompact, formatDayRange, formatInteger, formatMonthLabel, formatPercent } from "@/app/lib/format";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice } from "./StatusNotices";
import { SkeletonChartGrid } from "./Skeletons";

interface TrendSectionProps {
  state: FetchState<TrendData>;
}

const CHART_HEIGHT = 84;

/** Diagonal stripes in the accent colour — marks a bar whose month hasn't finished yet. */
const IN_PROGRESS_FILL =
  "repeating-linear-gradient(135deg, var(--color-accent) 0 3px, var(--color-accent-tint) 3px 6px)";

export function TrendSection({ state }: TrendSectionProps) {
  return (
    <section id="trends" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading number="11" title="Three-Month Trend" />

      {state.status === "loading" && <SkeletonChartGrid count={7} />}

      {state.status === "error" && (
        <ErrorNotice sectionLabel="Three-Month Trend" detail={state.message} isTokenError={state.isTokenError} />
      )}

      {state.status === "success" && <TrendCharts data={state.data} />}
    </section>
  );
}

function TrendCharts({ data }: { data: TrendData }) {
  const inProgressPeriod = data.inProgress?.period ?? null;
  const shortWindowPeriods = new Set(data.reachWindows.map((w) => w.period));
  const chart = (label: string, points: TrendPoint[], formatValue: (v: number | null) => string, usesReach = false) => (
    <TrendMiniChart
      label={label}
      points={points}
      formatValue={formatValue}
      inProgressPeriod={inProgressPeriod}
      footnotedPeriods={usesReach ? shortWindowPeriods : undefined}
    />
  );

  return (
    <div className="space-y-4">
      {data.inProgress && (
        <p className="flex items-center gap-2 text-xs text-ink-muted">
          <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: IN_PROGRESS_FILL }} />
          {formatMonthLabel(data.inProgress.period)} is in progress ({data.inProgress.daysElapsed} of{" "}
          {data.inProgress.daysInMonth} days), so its bars will keep growing.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-6 lg:grid-cols-4">
        {chart("Reach", data.reach, formatCompact, true)}
        {chart("Views", data.views, formatCompact)}
        {chart("Engagement Rate", data.engagementRate, (v) => formatPercent(v), true)}
        {chart("Likes", data.likes, formatInteger)}
        {chart("Comments", data.comments, formatInteger)}
        {chart("Shares", data.shares, formatInteger)}
        {chart("Saves", data.saves, formatInteger)}
      </div>

      {data.reachWindows.length > 0 && (
        <p className="text-xs text-ink-muted">
          * Reach and engagement rate for{" "}
          {data.reachWindows.map((w) => `${formatMonthLabel(w.period)} cover ${formatDayRange(w.range)}`).join("; ")}.
          Meta only measures reach over 30 days at a time.
        </p>
      )}
    </div>
  );
}

interface TrendMiniChartProps {
  label: string;
  points: TrendPoint[];
  formatValue: (value: number | null) => string;
  inProgressPeriod: string | null;
  /** Periods whose value covers fewer days than the month — shown with an asterisk. */
  footnotedPeriods?: Set<string>;
}

/**
 * A null point renders as an explicit dashed gap, never interpolated or defaulted to zero. The
 * still-running month is drawn striped so a partial month doesn't read as a drop.
 */
function TrendMiniChart({ label, points, formatValue, inProgressPeriod, footnotedPeriods }: TrendMiniChartProps) {
  const knownValues = points.map((p) => p.value).filter((v): v is number => v !== null);
  const max = knownValues.length > 0 ? Math.max(...knownValues) : 0;

  return (
    <div className="card p-4">
      <div className="label-caps mb-2">{label}</div>
      {/* Value sits above each bar; the hairline under the bars is the baseline. */}
      <div className="flex items-end gap-1 border-b border-border-strong pt-4" style={{ height: CHART_HEIGHT + 28 }}>
        {points.map((point) => {
          const hasValue = point.value !== null;
          const barHeight = hasValue && max > 0 ? Math.max((point.value! / max) * CHART_HEIGHT, 3) : 0;
          const inProgress = point.period === inProgressPeriod;
          return (
            <div key={point.period} className="flex h-full flex-1 flex-col items-center justify-end">
              <span className={`tabular-nums mb-1 text-[10px] whitespace-nowrap ${inProgress ? "font-semibold text-accent" : "text-ink-muted"}`}>
                {formatValue(point.value)}
                {footnotedPeriods?.has(point.period) && hasValue ? "*" : ""}
              </span>
              {hasValue ? (
                <div
                  className={`w-5 rounded-t-sm transition-[height] duration-500 ease-spring sm:w-6 ${inProgress ? "border border-accent" : "bg-accent-soft"}`}
                  style={{ height: barHeight, background: inProgress ? IN_PROGRESS_FILL : undefined }}
                  title={inProgress ? "Month in progress" : undefined}
                />
              ) : (
                <div className="h-6 w-5 border border-dashed border-border-strong sm:w-6" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {points.map((point) => (
          <div
            key={point.period}
            className={`flex-1 text-center text-[10px] uppercase ${point.period === inProgressPeriod ? "font-semibold text-accent" : "text-ink-faint"}`}
          >
            {formatMonthLabel(point.period).split(" ")[0]}
          </div>
        ))}
      </div>
    </div>
  );
}
