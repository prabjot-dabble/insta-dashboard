import type { FetchState } from "@/app/lib/useApiData";
import type { ContentItem, PartialListResult } from "@/app/lib/types";
import { pickBest, pickLowest } from "@/app/lib/ranking";
import { ContentCard } from "./ContentCard";
import { ContentTable } from "./ContentTable";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice, EmptyState } from "./StatusNotices";
import { SkeletonCard, SkeletonTable } from "./Skeletons";

interface ReelsSectionProps {
  state: FetchState<PartialListResult<ContentItem>>;
}

export function ReelsSection({ state }: ReelsSectionProps) {
  return (
    <section id="reels" className="mx-auto max-w-7xl px-6 py-14 md:px-10">
      <SectionHeading number="03" title="Reels Performance" />

      {state.status === "loading" && (
        <div className="space-y-10">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <SkeletonTable />
        </div>
      )}

      {state.status === "error" && <ErrorNotice sectionLabel="Reels" detail={state.message} />}

      {state.status === "success" && <ReelsContent result={state.data} />}
    </section>
  );
}

function ReelsContent({ result }: { result: PartialListResult<ContentItem> }) {
  const reels = result.data;

  if (reels.length === 0) {
    return <EmptyState message="No Reels published in this period" />;
  }

  const best = pickBest(reels, (r) => r.engagementRate, (r) => r.reach);
  const lowest = pickLowest(reels, (r) => r.engagementRate, (r) => r.reach);

  return (
    <div className="space-y-10">
      {result.errors.length > 0 && (
        <p className="text-xs text-ink-muted">
          {result.errors.length} Reel{result.errors.length === 1 ? "" : "s"} could not be loaded and {result.errors.length === 1 ? "is" : "are"} excluded below.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {best && <ContentCard label="BEST" item={best} />}
        {lowest && lowest.id !== best?.id && <ContentCard label="LOWEST" item={lowest} />}
      </div>

      <div>
        <div className="mb-3 text-xs tracking-wide text-ink-muted uppercase">Reels Performance</div>
        <ContentTable items={reels} showSkipRate contentColumnLabel="Reel" />
      </div>
    </div>
  );
}
