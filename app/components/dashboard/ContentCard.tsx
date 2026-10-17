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
  const labelColor = label === "BEST" ? "text-accent" : "text-negative";

  return (
    <a
      href={item.permalink ?? undefined}
      target={item.permalink ? "_blank" : undefined}
      rel={item.permalink ? "noreferrer" : undefined}
      className="flex gap-5 border border-border bg-surface p-5 transition-[transform,box-shadow,border-color] duration-150 ease-spring hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_8px_24px_-16px_rgba(28,30,27,0.35)] active:translate-y-0 active:scale-[0.996]"
    >
      <MediaThumbnail src={item.thumbnailUrl ?? item.mediaUrl} alt={truncateCaption(item.caption, 60)} size={128} />
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold tracking-wider ${labelColor}`}>{label}</div>
        <p className="mt-1 line-clamp-2 text-sm text-ink">{truncateCaption(item.caption, 120)}</p>
        <div className="mt-1 text-xs text-ink-muted">{formatDate(item.timestamp)}</div>

        <div className="mt-4 grid grid-cols-4 gap-x-4 gap-y-3">
          <InlineMetric label="Views" value={formatInteger(item.views)} />
          <InlineMetric label="Reach" value={formatInteger(item.reach)} />
          <InlineMetric label="Eng. Rate" value={formatPercent(item.engagementRate)} />
          <InlineMetric label="Likes" value={formatInteger(item.likes)} />
          <InlineMetric label="Comments" value={formatInteger(item.comments)} />
          <InlineMetric label="Shares" value={formatInteger(item.shares)} />
          <InlineMetric label="Saves" value={formatInteger(item.saved)} />
          {item.reelMetrics && <InlineMetric label="Skip Rate" value={formatPercent(item.reelMetrics.skipRate, 1)} />}
        </div>

        {item.reelMetrics && (
          <div className="mt-3 flex gap-5 border-t border-border pt-3 text-xs text-ink-muted">
            <span>Avg watch time {formatSecondsFromMs(item.reelMetrics.averageWatchTime)}</span>
            <span>Total watch time {formatDurationFromMs(item.reelMetrics.totalVideoViewTime)}</span>
          </div>
        )}
      </div>
    </a>
  );
}
