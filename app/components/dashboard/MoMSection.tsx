import type { FetchState } from "@/app/lib/useApiData";
import type { MetricComparison, MoMData } from "@/app/lib/types";
import { formatDayRange, formatInteger, formatPercent, formatSignedInteger, formatSignedPercent } from "@/app/lib/format";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice } from "./StatusNotices";
import { SkeletonTable } from "./Skeletons";

interface MoMSectionProps {
  state: FetchState<MoMData>;
}

interface Row {
  label: string;
  comparison: MetricComparison;
  isPercent?: boolean;
}

export function MoMSection({ state }: MoMSectionProps) {
  return (
    <section id="mom" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading number="06" title="Month-on-Month" />

      {state.status === "loading" && <SkeletonTable rows={10} />}

      {state.status === "error" && (
        <ErrorNotice sectionLabel="Month-on-Month" detail={state.message} isTokenError={state.isTokenError} />
      )}

      {state.status === "success" && <MoMTable data={state.data} />}
    </section>
  );
}

function MoMTable({ data }: { data: MoMData }) {
  const rows: Row[] = [
    { label: "Reach", comparison: data.reach },
    { label: "Views", comparison: data.views },
    { label: "Engagement Rate", comparison: data.engagementRate, isPercent: true },
    { label: "Likes", comparison: data.likes },
    { label: "Comments", comparison: data.comments },
    { label: "Shares", comparison: data.shares },
    { label: "Saves", comparison: data.saves },
    { label: "Profile Views", comparison: data.profileViews },
    { label: "Website Clicks", comparison: data.websiteClicks },
    { label: "Accounts Engaged", comparison: data.accountsEngaged },
  ];

  return (
    <div>
      <p className="mb-4 text-xs text-ink-muted">
        {formatDayRange(data.currentRange)} compared with the same days last month, {formatDayRange(data.previousRange)}.
      </p>
      <div className="overflow-x-auto bg-surface">
        {/* On a phone the absolute "Change" column is hidden so the % change stays on screen
            without sideways scrolling; it returns from the sm breakpoint up. */}
        <table className="w-full border-collapse text-[13px] sm:min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-surface-sunken text-left">
              <th scope="col" className="px-3 py-3.5 label-caps">
                Metric
              </th>
              <th scope="col" className="px-3 py-3.5 text-right label-caps">
                {formatDayRange(data.previousRange)}
              </th>
              <th scope="col" className="px-3 py-3.5 text-right label-caps">
                {formatDayRange(data.currentRange)}
              </th>
              <th scope="col" className="hidden px-3 py-3.5 text-right label-caps sm:table-cell">
                Change
              </th>
              <th scope="col" className="px-3 py-3.5 text-right label-caps">
                <span className="sm:hidden">Change</span>
                <span className="hidden sm:inline">Change %</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <MoMRowView key={row.label} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MoMRowView({ row }: { row: Row }) {
  const { comparison, isPercent } = row;
  const previous = isPercent ? formatPercent(comparison.previous) : formatInteger(comparison.previous);
  const current = isPercent ? formatPercent(comparison.current) : formatInteger(comparison.current);
  const change = isPercent
    ? formatSignedPercent(comparison.absoluteChange, 2)
    : formatSignedInteger(comparison.absoluteChange);
  const changePercent = formatSignedPercent(comparison.percentageChange, 1);
  const direction = (comparison.absoluteChange ?? 0) > 0 ? "text-accent-bright" : (comparison.absoluteChange ?? 0) < 0 ? "text-negative" : "text-ink-muted";

  return (
    <tr className="border-b border-border transition-colors last:border-b-0 hover:bg-surface-sunken">
      <td className="px-2 py-3 font-medium text-ink sm:px-4">{row.label}</td>
      <td className="tabular-nums px-2 py-3 text-right text-ink-muted sm:px-3">{previous}</td>
      <td className="tabular-nums px-2 py-3 text-right font-medium text-ink sm:px-3">{current}</td>
      <td className={`hidden tabular-nums px-3 py-3 text-right sm:table-cell ${comparison.absoluteChange === null ? "text-ink-muted" : direction}`}>
        {change}
      </td>
      <td className={`tabular-nums px-2 py-3 text-right sm:px-3 ${comparison.percentageChange === null ? "text-ink-muted" : direction}`}>
        {changePercent}
      </td>
    </tr>
  );
}
