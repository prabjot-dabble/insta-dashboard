import { MediaThumbnail } from "./MediaThumbnail";
import { InlineMetric } from "./Kpi";
import {
  formatDate,
  formatDurationFromMs,
  formatInteger,
  formatPercent,
  formatSecondsFromMs,
  truncateCaption,
} from "@/app/lib/format";
import type { ContentItem } from "@/app/lib/types";

interface ContentCardProps {
  label: "BEST" | "LOWEST";
  item: ContentItem;
}

/** Large visual card for a Best/Lowest Reel, Post, or Carousel — thumbnail, caption, date, and a
 *  compact metric grid. Reel-specific metrics (watch time, skip rate) only render when present. */
export function ContentCard({ label, item }: ContentCardProps) {
  return (
    <a
      href={item.permalink ?? undefined}
      target={item.permalink ? "_blank" : undefined}
      rel={item.permalink ? "noreferrer" : undefined}
      className="flex flex-col bg-surface p-4 transition-[transform,box-shadow] duration-150 ease-spring hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-16px_rgba(28,30,27,0.35)] active:translate-y-0 active:scale-[0.996] md:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <RankPill label={label} />
        <span className="tabular-nums text-[13px] text-ink-faint">{formatDate(item.timestamp)}</span>
      </div>

      <div className="mb-5 flex gap-4">
        <div className="shrink-0 bg-surface-sunken p-1">
          <MediaThumbnail src={item.thumbnailUrl ?? item.mediaUrl} alt={truncateCaption(item.caption, 60)} size={88} />
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <p className="line-clamp-3 text-sm leading-snug text-ink">{truncateCaption(item.caption, 140)}</p>
          <span className="label-caps mt-1">{item.contentType === "CAROUSEL" ? "Carousel" : item.contentType === "REEL" ? "Reel" : "Post"}</span>
        </div>
      </div>

      <div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-4 bg-surface-sunken p-4 sm:grid-cols-4">
          <InlineMetric label="Views" value={formatInteger(item.views)} />
          <InlineMetric label="Reach" value={formatInteger(item.reach)} />
          <InlineMetric label="Eng. Rate" value={formatPercent(item.engagementRate)} />
          <InlineMetric label="Likes" value={formatInteger(item.likes)} />
          <InlineMetric label="Comments" value={formatInteger(item.comments)} />
          <InlineMetric label="Shares" value={formatInteger(item.shares)} />
          <InlineMetric label="Saves" value={formatInteger(item.saved)} />
          {item.reelMetrics && <InlineMetric label="Skip Rate" value={formatPercent(item.reelMetrics.skipRate, 1)} />}
          {item.follows !== null && <InlineMetric label="New Follows" value={formatInteger(item.follows)} />}
          {item.profileVisits !== null && <InlineMetric label="Profile Visits" value={formatInteger(item.profileVisits)} />}
        </div>

        {item.reelMetrics && (
          <div className="mt-4 flex flex-wrap justify-between gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-ink-muted">
            <span>Avg watch time {formatSecondsFromMs(item.reelMetrics.averageWatchTime)}</span>
            <span>Total watch time {formatDurationFromMs(item.reelMetrics.totalVideoViewTime)}</span>
          </div>
        )}
      </div>
    </a>
  );
}

/** Solid green for BEST, quiet grey with red text for LOWEST, plain grey for anything neutral. */
export function RankPill({ label }: { label: string }) {
  const style =
    label === "BEST" ? "bg-accent text-white" : label === "LOWEST" ? "bg-surface-strong text-negative" : "bg-surface-strong text-ink-muted";
  return <span className={`px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase ${style}`}>{label}</span>;
}
