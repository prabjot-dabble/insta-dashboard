"use client";

import { useState } from "react";
import type { FetchState } from "@/app/lib/useApiData";
import type { ContentItem, PartialListResult } from "@/app/lib/types";
import { pickBest, pickLowest } from "@/app/lib/ranking";
import { ContentCard } from "./ContentCard";
import { ContentTable } from "./ContentTable";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice, EmptyState } from "./StatusNotices";
import { SkeletonCard, SkeletonTable } from "./Skeletons";

interface FeedSectionProps {
  state: FetchState<PartialListResult<ContentItem>>;
}

type FeedFilter = "all" | "POST" | "CAROUSEL";

const FILTERS: Array<{ value: FeedFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "POST", label: "Posts" },
  { value: "CAROUSEL", label: "Carousels" },
];

export function FeedSection({ state }: FeedSectionProps) {
  return (
    <section id="feed" className="mx-auto max-w-7xl px-6 py-14 md:px-10">
      <SectionHeading number="04" title="Feed Content" />

      {state.status === "loading" && (
        <div className="space-y-10">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonTable />
        </div>
      )}

      {state.status === "error" && (
        <ErrorNotice sectionLabel="Feed Content" detail={state.message} isTokenError={state.isTokenError} />
      )}

      {state.status === "success" && <FeedContent result={state.data} />}
    </section>
  );
}

function FeedContent({ result }: { result: PartialListResult<ContentItem> }) {
  const [filter, setFilter] = useState<FeedFilter>("all");
  const posts = result.data.filter((i) => i.contentType === "POST");
  const carousels = result.data.filter((i) => i.contentType === "CAROUSEL");

  if (result.data.length === 0) {
    return <EmptyState message="No Posts or Carousels published in this period" />;
  }

  const bestPost = pickBest(posts, (i) => i.engagementRate, (i) => i.reach);
  const lowestPost = pickLowest(posts, (i) => i.engagementRate, (i) => i.reach);
  const bestCarousel = pickBest(carousels, (i) => i.engagementRate, (i) => i.reach);
  const lowestCarousel = pickLowest(carousels, (i) => i.engagementRate, (i) => i.reach);

  const filtered = filter === "all" ? result.data : result.data.filter((i) => i.contentType === filter);

  return (
    <div className="space-y-10">
      {result.errors.length > 0 && (
        <p className="text-xs text-ink-muted">
          {result.errors.length} item{result.errors.length === 1 ? "" : "s"} could not be loaded and{" "}
          {result.errors.length === 1 ? "is" : "are"} excluded below.
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <div className="mb-3 text-xs tracking-wide text-ink-muted uppercase">Posts</div>
          {posts.length === 0 ? (
            <EmptyState message="No Posts in this period" />
          ) : (
            <div className="space-y-4">
              {bestPost && <ContentCard label="BEST" item={bestPost} />}
              {lowestPost && lowestPost.id !== bestPost?.id && <ContentCard label="LOWEST" item={lowestPost} />}
            </div>
          )}
        </div>
        <div>
          <div className="mb-3 text-xs tracking-wide text-ink-muted uppercase">Carousels</div>
          {carousels.length === 0 ? (
            <EmptyState message="No Carousels in this period" />
          ) : (
            <div className="space-y-4">
              {bestCarousel && <ContentCard label="BEST" item={bestCarousel} />}
              {lowestCarousel && lowestCarousel.id !== bestCarousel?.id && <ContentCard label="LOWEST" item={lowestCarousel} />}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs tracking-wide text-ink-muted uppercase">Feed Content</div>
          <div className="flex gap-1 border border-border-strong p-0.5" role="group" aria-label="Filter content type">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className={`px-3 py-1 text-xs transition-colors ${
                  filter === f.value ? "bg-ink text-bg" : "text-ink-muted hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <ContentTable items={filtered} contentColumnLabel="Content" showType />
      </div>
    </div>
  );
}
