import { MediaThumbnail } from "./MediaThumbnail";
import { InlineMetric } from "./Kpi";
import { RankPill } from "./ContentCard";
import { formatDate, formatInteger } from "@/app/lib/format";
import type { StoryItem } from "@/app/lib/types";

interface StoryCardProps {
  label: "BEST" | "LOWEST" | "LIVE NOW";
  item: StoryItem;
}

/**
 * Deliberately does NOT show Likes/Comments/Shares/Saves — those metrics are not part of the
 * verified Story insight response (see lib/instagram/endpoints.ts#getStoryInsights). Showing them
 * here would silently imply data that doesn't exist.
 */
export function StoryCard({ label, item }: StoryCardProps) {
  return (
    <a
      href={item.permalink ?? undefined}
      target={item.permalink ? "_blank" : undefined}
      rel={item.permalink ? "noreferrer" : undefined}
      className="card flex flex-col gap-4 p-4 transition-[transform,box-shadow,border-color] hover:border-border-strong duration-150 ease-spring hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-16px_rgba(28,30,27,0.35)] active:translate-y-0 active:scale-[0.996] sm:flex-row sm:items-center sm:gap-6 md:p-6"
    >
      {/* Stories are vertical, so the thumbnail is portrait (9:16-ish), not square. */}
      <div className="w-[88px] shrink-0 overflow-hidden rounded bg-surface-sunken p-1">
        <div className="relative h-[124px] w-20 overflow-hidden">
          <MediaThumbnail src={item.thumbnailUrl ?? item.mediaUrl} alt="Story thumbnail" size={124} className="absolute top-0 left-1/2 -translate-x-1/2" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <RankPill label={label} />
          <span className="tabular-nums text-[13px] text-ink-faint">{formatDate(item.timestamp)}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-4 rounded bg-surface-sunken p-4">
          <InlineMetric label="Views" value={formatInteger(item.views)} />
          <InlineMetric label="Reach" value={formatInteger(item.reach)} />
          <InlineMetric label="Replies" value={formatInteger(item.replies)} />
          <InlineMetric label="Follows" value={formatInteger(item.follows)} />
          <InlineMetric label="Profile Visits" value={formatInteger(item.profileVisits)} />
          <InlineMetric label="Navigation" value={formatInteger(item.navigation)} />
        </div>
      </div>
    </a>
  );
}
