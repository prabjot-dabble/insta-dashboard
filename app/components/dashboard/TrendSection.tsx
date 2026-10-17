import type { FetchState } from "@/app/lib/useApiData";
import type { TrendData, TrendPoint } from "@/app/lib/types";
import { formatCompact, formatInteger, formatMonthLabel, formatPercent } from "@/app/lib/format";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice } from "./StatusNotices";
import { SkeletonChartGrid } from "./Skeletons";

interface TrendSectionProps {
  state: FetchState<TrendData>;
}

const CHART_HEIGHT = 84;

export function TrendSection({ state }: TrendSectionProps) {
  return (
    <section id="trends" className="mx-auto max-w-7xl px-6 py-14 md:px-10">
      <SectionHeading number="07" title="Three-Month Trend" />

      {state.status === "loading" && <SkeletonChartGrid count={7} />}

      {state.status === "error" && (
        <ErrorNotice sectionLabel="Three-Month Trend" detail={state.message} isTokenError={state.isTokenError} />
      )}

      {state.status === "success" && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          <TrendMiniChart label="Reach" points={state.data.reach} formatValue={formatInteger} />
          <TrendMiniChart label="Views" points={state.data.views} formatValue={formatCompact} />
          <TrendMiniChart label="Engagement Rate" points={state.data.engagementRate} formatValue={(v) => formatPercent(v)} />
          <TrendMiniChart label="Likes" points={state.data.likes} formatValue={formatInteger} />
          <TrendMiniChart label="Comments" points={state.data.comments} formatValue={formatInteger} />
          <TrendMiniChart label="Shares" points={state.data.shares} formatValue={formatInteger} />
          <TrendMiniChart label="Saves" points={state.data.saves} formatValue={formatInteger} />
        </div>
      )}
    </section>
  );
}

interface TrendMiniChartProps {
  label: string;
  points: TrendPoint[];
  formatValue: (value: number | null) => string;
}

/**
 * A null point (e.g. a 31-day calendar month that needed 2 API chunks, so no single accurate
 * reach figure exists — see lib/instagram/service.ts) renders as an explicit dashed gap, never
 * interpolated or defaulted to zero. A missing bar is the honest representation.
 */
function TrendMiniChart({ label, points, formatValue }: TrendMiniChartProps) {
  const knownValues = points.map((p) => p.value).filter((v): v is number => v !== null);
  const max = knownValues.length > 0 ? Math.max(...knownValues) : 0;

  return (
    <div>
      <div className="text-xs tracking-wide text-ink-muted uppercase">{label}</div>
      <div className="mt-3 flex items-end gap-2" style={{ height: CHART_HEIGHT }}>
        {points.map((point) => {
          const hasValue = point.value !== null;
          const barHeight = hasValue && max > 0 ? Math.max((point.value! / max) * CHART_HEIGHT, 3) : 0;
          return (
            <div key={point.period} className="flex h-full flex-1 flex-col items-center justify-end">
              {hasValue ? (
                <div
                  className="w-full bg-accent transition-[height] duration-500 ease-spring"
                  style={{ height: barHeight }}
                />
              ) : (
                <div className="flex h-6 w-full items-center justify-center border border-dashed border-border-strong">
                  <span className="text-[10px] text-ink-faint">—</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {points.map((point) => (
          <div key={point.period} className="flex-1 text-center">
            <div className="text-[10px] text-ink-faint">{formatMonthLabel(point.period)}</div>
            <div className="tabular-nums text-xs font-medium text-ink">{formatValue(point.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
