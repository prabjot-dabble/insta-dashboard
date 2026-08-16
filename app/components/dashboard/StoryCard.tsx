import { MediaThumbnail } from "./MediaThumbnail";
import { InlineMetric } from "./Kpi";
import { formatDate, formatInteger } from "@/app/lib/format";
import type { StoryItem } from "@/app/lib/types";

interface StoryCardProps {
  label: "BEST" | "LOWEST";
  item: StoryItem;
}

/**
 * Deliberately does NOT show Likes/Comments/Shares/Saves — those metrics are not part of the
 * verified Story insight response (see lib/instagram/endpoints.ts#getStoryInsights). Showing them
 * here would silently imply data that doesn't exist.
 */
export function StoryCard({ label, item }: StoryCardProps) {
  const labelColor = label === "BEST" ? "text-accent" : "text-negative";

  return (
    <a
      href={item.permalink ?? undefined}
      target={item.permalink ? "_blank" : undefined}
      rel={item.permalink ? "noreferrer" : undefined}
      className="flex gap-5 border border-border bg-surface p-5 transition-colors hover:border-border-strong"
    >
      <MediaThumbnail src={item.thumbnailUrl ?? item.mediaUrl} alt="Story thumbnail" size={128} />
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold tracking-wider ${labelColor}`}>{label}</div>
        <div className="mt-1 text-xs text-ink-muted">{formatDate(item.timestamp)}</div>
        <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
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
