import { SortableTable, type ColumnDef } from "./SortableTable";
import { MediaThumbnail } from "./MediaThumbnail";
import { formatDate, formatInteger, formatPercent, formatWeekday, truncateCaption } from "@/app/lib/format";
import type { ContentItem } from "@/app/lib/types";

interface ContentTableProps {
  items: ContentItem[];
  /** Reels-only metric — only meaningful (and only rendered) when the table is scoped to Reels. */
  showSkipRate?: boolean;
  /** Section 08's combined table needs a Type column to distinguish Reel/Post/Carousel rows. */
  showType?: boolean;
  contentColumnLabel?: string;
}

/** Shared sortable table for Reels (03), Feed content (04), and the combined Content Performance
 *  table (08) — same columns, same client-side sort, same null handling, one implementation. */
export function ContentTable({ items, showSkipRate = false, showType = false, contentColumnLabel = "Content" }: ContentTableProps) {
  const columns: ColumnDef<ContentItem>[] = [
    {
      key: "thumbnail",
      header: "",
      render: (item) => (
        <div className="w-fit bg-surface-sunken p-0.5">
          <MediaThumbnail src={item.thumbnailUrl ?? item.mediaUrl} alt="" size={40} />
        </div>
      ),
    },
    {
      key: "content",
      header: contentColumnLabel,
      render: (item) => (
        <a
          href={item.permalink ?? undefined}
          target={item.permalink ? "_blank" : undefined}
          rel={item.permalink ? "noreferrer" : undefined}
          className="block max-w-[240px] truncate text-ink hover:text-accent"
          title={item.caption ?? undefined}
        >
          {truncateCaption(item.caption, 60)}
        </a>
      ),
    },
    ...(showType
      ? [
          {
            key: "type",
            header: "Type",
            render: (item) => (
              <span
                className={`inline-block px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase ${
                  item.contentType === "REEL" ? "bg-accent text-white" : item.contentType === "POST" ? "bg-surface-strong text-ink" : "bg-surface-sunken text-ink-muted"
                }`}
              >
                {item.contentType}
              </span>
            ),
          } satisfies ColumnDef<ContentItem>,
        ]
      : []),
    {
      key: "date",
      header: "Date",
      render: (item) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-muted">
          {formatDate(item.timestamp)}
          <span className="bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
            {formatWeekday(item.timestamp)}
          </span>
        </span>
      ),
      sortValue: (item) => new Date(item.timestamp).getTime(),
    },
    {
      key: "views",
      header: "Views",
      align: "right",
      render: (item) => formatInteger(item.views),
      sortValue: (item) => item.views,
    },
    {
      key: "reach",
      header: "Reach",
      align: "right",
      render: (item) => formatInteger(item.reach),
      sortValue: (item) => item.reach,
    },
    {
      key: "engagementRate",
      header: "Eng. Rate",
      align: "right",
      render: (item) => <span className="font-semibold text-accent">{formatPercent(item.engagementRate)}</span>,
      sortValue: (item) => item.engagementRate,
    },
    {
      key: "likes",
      header: "Likes",
      align: "right",
      render: (item) => formatInteger(item.likes),
      sortValue: (item) => item.likes,
    },
    {
      key: "comments",
      header: "Comments",
      align: "right",
      render: (item) => formatInteger(item.comments),
      sortValue: (item) => item.comments,
    },
    {
      key: "shares",
      header: "Shares",
      align: "right",
      render: (item) => formatInteger(item.shares),
      sortValue: (item) => item.shares,
    },
    {
      key: "saves",
      header: "Saves",
      align: "right",
      render: (item) => formatInteger(item.saved),
      sortValue: (item) => item.saved,
    },
    // Follows / profile visits exist for feed posts only — Reels show "—" (Meta doesn't offer them).
    {
      key: "follows",
      header: "Follows",
      align: "right",
      render: (item) => formatInteger(item.follows),
      sortValue: (item) => item.follows,
    },
    {
      key: "profileVisits",
      header: "Profile Visits",
      align: "right",
      render: (item) => formatInteger(item.profileVisits),
      sortValue: (item) => item.profileVisits,
    },
    ...(showSkipRate
      ? [
          {
            key: "skipRate",
            header: "Skip Rate",
            align: "right" as const,
            render: (item: ContentItem) => formatPercent(item.reelMetrics?.skipRate ?? null, 1),
            sortValue: (item: ContentItem) => item.reelMetrics?.skipRate ?? null,
          } satisfies ColumnDef<ContentItem>,
        ]
      : []),
  ];

  return (
    <SortableTable
      columns={columns}
      data={items}
      defaultSortKey="engagementRate"
      defaultSortDirection="desc"
      getRowKey={(item) => item.id}
    />
  );
}
