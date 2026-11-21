// Small, dependency-free chart pieces shared by the newer sections. Plain divs and CSS so they
// inherit the theme and need no chart library (nothing extra to install or pay for).

import { formatInteger } from "@/app/lib/format";
import type { DailyPoint, LabelValue } from "@/app/lib/types";

/** "12.3%" for a share of a total. */
export function percentOf(value: number, total: number, decimals = 0): string {
  return total > 0 ? `${((value / total) * 100).toFixed(decimals)}%` : "—";
}

/** Labelled horizontal bars, longest first as given. `highlight` gets the strong accent. */
export function HBarList({
  items,
  total,
  highlight,
  format = formatInteger,
  showShare = true,
}: {
  items: LabelValue[];
  /** What shares are a percentage of; defaults to the sum of the items. */
  total?: number;
  highlight?: string;
  format?: (v: number) => string;
  showShare?: boolean;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const sum = total ?? items.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-ink">{item.label}</span>
            <span className="tabular-nums shrink-0 text-ink-muted">
              {format(item.value)}
              {showShare && <span className="ml-2 text-ink-faint">{percentOf(item.value, sum)}</span>}
            </span>
          </div>
          <div className="h-1.5 bg-surface-sunken">
            <div
              className={`h-full transition-[width] duration-500 ease-spring ${item.label === highlight ? "bg-negative" : "bg-accent-soft"}`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One full-width bar split into parts, with a legend underneath. */
export function SplitBar({ parts }: { parts: Array<{ label: string; value: number; tone: "strong" | "soft" | "muted" | "negative" }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const toneClass = { strong: "bg-accent", soft: "bg-accent-tint", muted: "bg-surface-strong", negative: "bg-negative" };
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden bg-surface-sunken">
        {parts.map((p) => (
          <div key={p.label} className={toneClass[p.tone]} style={{ width: total ? `${(p.value / total) * 100}%` : 0 }} title={`${p.label}: ${formatInteger(p.value)}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`inline-block h-2.5 w-2.5 ${toneClass[p.tone]}`} />
            {p.label} <span className="tabular-nums text-ink">{percentOf(p.value, total)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Daily bars with the peak labelled and first/last dates under the axis. */
export function DailyBars({ points, height = 96, format = formatInteger }: { points: DailyPoint[]; height?: number; format?: (v: number) => string }) {
  if (points.length === 0) return <p className="text-xs text-ink-muted">No daily data for this period.</p>;
  const max = Math.max(1, ...points.map((p) => p.value));
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  const label = (d: string) => SHORT_DAY.format(new Date(`${d}T00:00:00Z`));
  return (
    <div>
      <div className="flex items-end gap-[2px] border-b border-border-strong" style={{ height }}>
        {points.map((p) => (
          <div
            key={p.date}
            className={`flex-1 ${p.date === peak.date ? "bg-accent" : "bg-accent-soft/70"}`}
            style={{ height: `${Math.max((p.value / max) * 100, 2)}%` }}
            title={`${label(p.date)}: ${format(p.value)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-faint uppercase">
        <span>{label(points[0].date)}</span>
        <span className="normal-case text-ink-muted">
          Peak {format(peak.value)} on {label(peak.date)}
        </span>
        <span>{label(points[points.length - 1].date)}</span>
      </div>
    </div>
  );
}

/** A white tile with a caps label — the basic container for a chart. */
export function Tile({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface p-4 md:p-6 ${className}`}>
      <div className="label-caps mb-4">{title}</div>
      {children}
    </div>
  );
}
