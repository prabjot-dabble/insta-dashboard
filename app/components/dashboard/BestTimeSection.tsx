import { Fragment } from "react";
import type { FetchState } from "@/app/lib/useApiData";
import type { AudienceData, ContentItem, PartialListResult } from "@/app/lib/types";
import { formatInteger } from "@/app/lib/format";
import { Tile } from "./Charts";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice } from "./StatusNotices";
import { SkeletonChartGrid } from "./Skeletons";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "9 pm" style hour label. */
function hourLabel(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour} ${suffix}`;
}

const IST_PARTS = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", hourCycle: "h23" });

function istWeekdayHour(iso: string): { day: number; hour: number } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(IST_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
  const day = DAYS.indexOf(parts.weekday);
  return day < 0 ? null : { day, hour: Number(parts.hour) };
}

/**
 * When to post: Meta's hourly "followers online" (last ~30 days), plus how this period's own posts
 * did by weekday and time of day. The second part uses the posts already loaded for the Reels and
 * Feed sections, so it costs no extra API calls.
 */
export function BestTimeSection({
  audienceState,
  reelsState,
  feedState,
  number,
}: {
  audienceState: FetchState<AudienceData>;
  reelsState: FetchState<PartialListResult<ContentItem>>;
  feedState: FetchState<PartialListResult<ContentItem>>;
  number: string;
}) {
  const posts = [
    ...(reelsState.status === "success" ? reelsState.data.data : []),
    ...(feedState.status === "success" ? feedState.data.data : []),
  ];
  return (
    <section id="best-time" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading number={number} title="Best Time to Post" note="All times are India time (IST)." />
      {audienceState.status === "loading" && <SkeletonChartGrid count={2} />}
      {audienceState.status === "error" && (
        <ErrorNotice sectionLabel="Best Time to Post" detail={audienceState.message} isTokenError={audienceState.isTokenError} />
      )}
      {audienceState.status === "success" && (
        <div className="space-y-6">
          <p className="text-sm text-ink">
            Followers are most active around <strong className="font-semibold">{audienceState.data.peakHours.map(hourLabel).join(", ")}</strong>.
          </p>
          <Tile title="Followers online, by day and hour (average of the last 30 days)">
            <Heatmap grid={audienceState.data.onlineHeatmap} />
          </Tile>
          <PostTiming posts={posts} />
        </div>
      )}
    </section>
  );
}

/** Five shades, lightest to darkest. Each covers a fifth of the 168 day-hour slots (ranked), so
 *  the busy daytime hours, which are all close in raw numbers, still separate visibly. */
const SHADES = ["#eef2f7", "#c7d7f5", "#89aef0", "#3b74e6", "#1e3a8a"];
const SHADE_TEXT = ["Quietest", "Quiet", "Average", "Busy", "Busiest"];
const TOP_SLOTS = 5;

function Heatmap({ grid }: { grid: number[][] }) {
  const cells = grid.flatMap((row, d) => row.map((v, h) => ({ d, h, v })));
  const sorted = [...cells].map((c) => c.v).sort((a, b) => a - b);
  // Upper bound of each of the first four shades (quintiles of the ranked values).
  const cuts = [1, 2, 3, 4].map((q) => sorted[Math.floor((q * sorted.length) / 5)] ?? 0);
  const shadeOf = (v: number) => cuts.filter((c) => v >= c).length;
  const top = [...cells].sort((a, b) => b.v - a.v).slice(0, TOP_SLOTS);
  const isTop = (d: number, h: number) => top.some((t) => t.d === d && t.h === h);
  const ranges = SHADES.map((_, i) => {
    const lo = i === 0 ? sorted[0] : cuts[i - 1];
    const hi = i === 4 ? sorted[sorted.length - 1] : cuts[i];
    return `${formatInteger(lo)}–${formatInteger(hi)}`;
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="label-caps mb-2">Busiest slots</p>
        <ol className="flex flex-wrap gap-2">
          {top.map((t, i) => (
            <li key={`${t.d}-${t.h}`} className="flex items-center gap-2 rounded border border-border bg-surface px-2.5 py-1.5 text-[13px]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white">{i + 1}</span>
              <span className="font-medium text-ink">{DAYS[t.d]} {hourLabel(t.h)}</span>
              <span className="tabular-nums text-ink-muted">~{formatInteger(t.v)} online</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[36px_repeat(24,1fr)] gap-[2px]">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center text-[9px] text-ink-faint">{h % 3 === 0 ? hourLabel(h).replace(" ", "") : ""}</span>
            ))}
            {grid.map((row, d) => (
              <Fragment key={d}>
                <span className="self-center text-[11px] text-ink-muted">{DAYS[d]}</span>
                {row.map((v, h) => {
                  const shade = shadeOf(v);
                  return (
                    <span
                      key={h}
                      className="flex h-7 items-center justify-center rounded-[2px]"
                      style={{ backgroundColor: SHADES[shade] }}
                      title={`${DAYS[d]} ${hourLabel(h)}: ~${formatInteger(v)} followers online (${SHADE_TEXT[shade].toLowerCase()})`}
                    >
                      {isTop(d, h) && <span className="h-2 w-2 rounded-full bg-white ring-2 ring-amber-400" />}
                    </span>
                  );
                })}
              </Fragment>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-muted">
            {SHADES.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-[2px] border border-border" style={{ backgroundColor: c }} />
                {SHADE_TEXT[i]} <span className="tabular-nums text-ink-faint">({ranges[i]})</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-white ring-2 ring-amber-400" />
              Top {TOP_SLOTS} slots
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Average engagement rate of this period's posts by IST weekday and by time-of-day band. */
function PostTiming({ posts }: { posts: ContentItem[] }) {
  const rated = posts
    .map((p) => ({ p, when: istWeekdayHour(p.timestamp) }))
    .filter((x): x is { p: ContentItem; when: { day: number; hour: number } } => x.when !== null && x.p.engagementRate !== null);

  if (rated.length < 3) {
    return <p className="text-xs text-ink-muted">Pick a longer date range to compare how your own posts did by day and time (needs at least 3 posts).</p>;
  }

  const bands = [
    { label: "Morning (6–12)", test: (h: number) => h >= 6 && h < 12 },
    { label: "Afternoon (12–5)", test: (h: number) => h >= 12 && h < 17 },
    { label: "Evening (5–9)", test: (h: number) => h >= 17 && h < 21 },
    { label: "Night (9–6)", test: (h: number) => h >= 21 || h < 6 },
  ];
  const avg = (list: typeof rated) => (list.length ? list.reduce((s, x) => s + (x.p.engagementRate as number), 0) / list.length : null);
  const byDay = DAYS.map((label, d) => ({ label, list: rated.filter((x) => x.when.day === d) }));
  const byBand = bands.map((b) => ({ label: b.label, list: rated.filter((x) => b.test(x.when.hour)) }));

  return (
    <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-2">
      <Tile title={`Your posts by weekday (avg. engagement rate, ${rated.length} posts)`}>
        <RateBars rows={byDay.map((d) => ({ label: d.label, rate: avg(d.list), count: d.list.length }))} />
      </Tile>
      <Tile title="Your posts by time of day">
        <RateBars rows={byBand.map((b) => ({ label: b.label, rate: avg(b.list), count: b.list.length }))} />
      </Tile>
    </div>
  );
}

function RateBars({ rows }: { rows: Array<{ label: string; rate: number | null; count: number }> }) {
  const max = Math.max(0.01, ...rows.map((r) => r.rate ?? 0));
  const best = rows.reduce((a, b) => ((b.rate ?? -1) > (a.rate ?? -1) ? b : a));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[112px_1fr_92px] items-center gap-3 text-[13px]">
          <span className="text-ink">{r.label}</span>
          <div className="h-1.5 bg-surface-sunken">
            {r.rate !== null && <div className={`h-full ${r.label === best.label ? "bg-accent" : "bg-accent-soft/70"}`} style={{ width: `${(r.rate / max) * 100}%` }} />}
          </div>
          <span className="tabular-nums text-right text-ink-muted">
            {r.rate === null ? "no posts" : `${r.rate.toFixed(2)}%`}
            {r.count > 0 && <span className="text-ink-faint"> · {r.count}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
