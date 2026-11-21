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

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const min = Math.min(...grid.flat());
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[620px]">
        <div className="grid grid-cols-[36px_repeat(24,1fr)] gap-[2px]">
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[9px] text-ink-faint">{h % 3 === 0 ? hourLabel(h).replace(" ", "") : ""}</span>
          ))}
          {grid.map((row, d) => (
            <Row key={d} label={DAYS[d]} row={row} min={min} max={max} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-muted">
          Fewer online
          <span className="inline-flex">
            {[0.1, 0.3, 0.55, 0.8, 1].map((o) => (
              <span key={o} className="inline-block h-2.5 w-5 bg-accent" style={{ opacity: o }} />
            ))}
          </span>
          More online
        </div>
      </div>
    </div>
  );
}

function Row({ label, row, min, max }: { label: string; row: number[]; min: number; max: number }) {
  return (
    <>
      <span className="self-center text-[11px] text-ink-muted">{label}</span>
      {row.map((v, h) => (
        <span
          key={h}
          className="h-6 bg-accent"
          style={{ opacity: 0.08 + 0.92 * ((v - min) / Math.max(1, max - min)) }}
          title={`${label} ${hourLabel(h)}: ~${formatInteger(v)} followers online`}
        />
      ))}
    </>
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
