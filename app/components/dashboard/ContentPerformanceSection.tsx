"use client";

import { useMemo, useState } from "react";
import type { FetchState } from "@/app/lib/useApiData";
import type { ContentItem, ContentType, PartialListResult } from "@/app/lib/types";
import { ContentTable } from "./ContentTable";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice, EmptyState } from "./StatusNotices";
import { SkeletonTable } from "./Skeletons";

interface ContentPerformanceSectionProps {
  reelsState: FetchState<PartialListResult<ContentItem>>;
  feedState: FetchState<PartialListResult<ContentItem>>;
}

type PerformanceFilter = "all" | ContentType;

const FILTERS: Array<{ value: PerformanceFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "REEL", label: "Reels" },
  { value: "POST", label: "Posts" },
  { value: "CAROUSEL", label: "Carousels" },
];

/**
 * Combines the already-fetched Reels and Feed datasets client-side — no new requests. This is the
 * same principle as the table's own client-side sorting: the API has already supplied everything
 * needed, so combining/filtering/sorting stays entirely in the browser.
 */
export function ContentPerformanceSection({ reelsState, feedState }: ContentPerformanceSectionProps) {
  const [filter, setFilter] = useState<PerformanceFilter>("all");
  const loading = reelsState.status === "loading" || feedState.status === "loading";
  const bothFailed = reelsState.status === "error" && feedState.status === "error";

  const combined = useMemo(() => {
    const reels = reelsState.status === "success" ? reelsState.data.data : [];
    const feed = feedState.status === "success" ? feedState.data.data : [];
    return [...reels, ...feed];
  }, [reelsState, feedState]);

  const filtered = filter === "all" ? combined : combined.filter((item) => item.contentType === filter);

  return (
    <section id="content-performance" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading
        number="12"
        title="Content Performance"
        action={
          !loading && !bothFailed && combined.length > 0 ? (
            <div className="card flex w-fit gap-1 p-1" role="group" aria-label="Filter content type">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                  className={`rounded px-3 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase transition-colors ${
                    filter === f.value ? "bg-accent text-white shadow-sm" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />

      {loading && <SkeletonTable rows={8} />}

      {!loading && bothFailed && (
        <ErrorNotice
          sectionLabel="Content Performance"
          detail={reelsState.status === "error" ? reelsState.message : undefined}
          isTokenError={
            (reelsState.status === "error" && reelsState.isTokenError) ||
            (feedState.status === "error" && feedState.isTokenError)
          }
        />
      )}

      {!loading && !bothFailed && combined.length === 0 && <EmptyState message="No content published in this period" />}

      {!loading && !bothFailed && combined.length > 0 && (
        <ContentTable items={filtered} showType={filter === "all"} showSkipRate={filter === "REEL"} contentColumnLabel="Content" />
      )}
    </section>
  );
}
