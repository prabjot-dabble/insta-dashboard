export interface KpiItem {
  label: string;
  value: string;
  /** Pre-formatted delta string (e.g. "▲ 18.4%"), only ever passed when the API actually returned
   *  a valid comparison — never fabricated client-side. Positive/negative color comes from
   *  `direction`. */
  delta?: string;
  direction?: "up" | "down" | "flat";
  /** Optional quiet line under the value (e.g. follower growth detail). Hero row only. */
  note?: string;
}

function deltaColor(direction?: KpiItem["direction"]): string {
  if (direction === "up") return "text-accent-bright";
  if (direction === "down") return "text-negative";
  return "text-ink-muted";
}

/** The masthead row: the four PRIMARY KPIs (Followers, Reach, Views, Engagement Rate), each on its
 *  own white tile at hero scale — this is the first thing the CEO reads. */
export function KpiHeroRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="card flex flex-col justify-between p-4 md:p-6">
          <div>
            <div className="label-caps mb-1">{item.label}</div>
            <div className="tabular-nums font-display text-[24px] font-bold leading-8 sm:text-[30px] sm:leading-9 tracking-[-0.025em] text-ink md:text-[38px] md:leading-[42px]">
              {item.value}
            </div>
          </div>
          {(item.delta || item.note) && (
            <div className="mt-4 border-t border-surface-sunken pt-2">
              {item.delta && (
                <div className={`tabular-nums text-xs font-medium md:text-sm ${deltaColor(item.direction)}`}>{item.delta}</div>
              )}
              {item.note && <div className="tabular-nums mt-0.5 text-xs text-ink-muted">{item.note}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** SECONDARY KPIs — smaller white tiles, change shown on the right of the value. */
export function KpiSecondaryRow({ items }: { items: KpiItem[] }) {
  return (
    <div className={`grid grid-cols-2 gap-3 md:gap-6 ${items.length === 5 ? "md:grid-cols-3 lg:grid-cols-5" : "md:grid-cols-4"}`}>
      {items.map((item, i) => (
        <div key={item.label} className={`card p-4 ${items.length % 2 === 1 && i === items.length - 1 ? "col-span-2 md:col-span-1" : ""}`}>
          <div className="label-caps mb-1">{item.label}</div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="tabular-nums font-display text-[20px] font-semibold leading-7 sm:text-[22px] tracking-[-0.02em] text-ink">{item.value}</span>
            {item.delta && <span className={`tabular-nums text-xs font-medium ${deltaColor(item.direction)}`}>{item.delta}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The breakdown strip (Likes / Comments / Shares / Saves / Replies) — one quiet tinted band. */
export function KpiBreakdownStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 card px-4 py-3 md:justify-between md:px-6">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-x-6">
          {i > 0 && <span aria-hidden className="hidden h-4 w-px bg-border-strong md:block" />}
          <div className="flex items-baseline gap-2">
            <span className="label-caps">{item.label}</span>
            <span className="tabular-nums text-[13px] font-medium text-ink">{item.value}</span>
            {item.delta && <span className={`tabular-nums text-xs ${deltaColor(item.direction)}`}>{item.delta}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Small inline metric used inside content cards ("Views 4,126"). */
export function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-caps text-[10px]">{label}</div>
      <div className="tabular-nums text-[13px] font-semibold text-ink">{value}</div>
    </div>
  );
}
