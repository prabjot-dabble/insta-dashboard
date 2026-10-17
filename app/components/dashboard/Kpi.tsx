export interface KpiItem {
  label: string;
  value: string;
  /** Pre-formatted delta string (e.g. "+18.4%"), only ever passed when the API actually returned
   *  a valid comparison — never fabricated client-side. Positive/negative color is derived from
   *  the sign of the raw number the caller already formatted, via `direction`. */
  delta?: string;
  direction?: "up" | "down" | "flat";
}

function deltaColor(direction?: KpiItem["direction"]): string {
  if (direction === "up") return "text-accent";
  if (direction === "down") return "text-negative";
  return "text-ink-muted";
}

/** The masthead row: the four PRIMARY KPIs (Followers, Reach, Views, Engagement Rate), shown at
 *  hero scale with vertical hairline dividers — this is the first thing the CEO reads. */
export function KpiHeroRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 divide-y divide-border border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="py-6 pr-6 sm:px-6 sm:first:pl-0 sm:last:pr-0">
          <div className="text-xs font-medium tracking-wide text-ink-muted uppercase">{item.label}</div>
          <div className="tabular-nums mt-2 font-display text-[2.75rem] leading-none tracking-[-0.02em] text-ink">
            {item.value}
          </div>
          {item.delta && (
            <div
              className={`tabular-nums mt-2 text-sm font-medium transition-colors duration-150 ease-spring ${deltaColor(item.direction)}`}
            >
              {item.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** SECONDARY KPIs — one visual step down from the hero row. */
export function KpiSecondaryRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-xs font-medium tracking-wide text-ink-muted uppercase">{item.label}</div>
          <div className="tabular-nums mt-1 text-xl font-medium tracking-[-0.01em] text-ink">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

/** The breakdown strip (Likes / Comments / Shares / Saves / Replies) — quiet, compact, inline. */
export function KpiBreakdownStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-5">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <span className="text-xs tracking-wide text-ink-faint uppercase">{item.label}</span>
          <span className="tabular-nums text-sm font-medium text-ink">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Small inline metric used inside content cards ("Views 4,126"). */
export function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] tracking-wide text-ink-faint uppercase">{label}</div>
      <div className="tabular-nums text-sm font-medium text-ink">{value}</div>
    </div>
  );
}
