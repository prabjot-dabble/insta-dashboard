import type { FetchState } from "@/app/lib/useApiData";
import type { MetricComparison, MoMData } from "@/app/lib/types";
import { formatDate, formatInteger, formatPercent, formatSignedInteger, formatSignedPercent } from "@/app/lib/format";
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
    <section id="mom" className="mx-auto max-w-7xl px-6 py-14 md:px-10">
      <SectionHeading number="06" title="Month-on-Month" />

      {state.status === "loading" && <SkeletonTable rows={10} />}

      {state.status === "error" && <ErrorNotice sectionLabel="Month-on-Month" detail={state.message} />}

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
        Previous month {formatDate(data.previousRange.since)} – {formatDate(data.previousRange.until)} vs. current
        month {formatDate(data.currentRange.since)} – {formatDate(data.currentRange.until)} (in progress).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left">
              <th scope="col" className="px-3 py-2.5 text-xs font-medium tracking-wide text-ink-muted uppercase">
                Metric
              </th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-medium tracking-wide text-ink-muted uppercase">
                Previous Month
              </th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-medium tracking-wide text-ink-muted uppercase">
                Current Month
              </th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-medium tracking-wide text-ink-muted uppercase">
                Change
              </th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-medium tracking-wide text-ink-muted uppercase">
                Change %
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
  const direction = (comparison.absoluteChange ?? 0) > 0 ? "text-accent" : (comparison.absoluteChange ?? 0) < 0 ? "text-negative" : "text-ink-muted";

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-2.5 text-ink">{row.label}</td>
      <td className="tabular-nums px-3 py-2.5 text-right text-ink-muted">{previous}</td>
      <td className="tabular-nums px-3 py-2.5 text-right font-medium text-ink">{current}</td>
      <td className={`tabular-nums px-3 py-2.5 text-right ${comparison.absoluteChange === null ? "text-ink-muted" : direction}`}>
        {change}
      </td>
      <td className={`tabular-nums px-3 py-2.5 text-right ${comparison.percentageChange === null ? "text-ink-muted" : direction}`}>
        {changePercent}
      </td>
    </tr>
  );
}
