import type { FetchState } from "@/app/lib/useApiData";
import type { ContentItem, PartialListResult } from "@/app/lib/types";
import { bestAndLowestSettled, MIN_RANKING_AGE_DAYS } from "@/app/lib/ranking";
import { ContentCard } from "./ContentCard";
import { SeeAllLink } from "./FeedSection";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice, EmptyState, RankingNote } from "./StatusNotices";
import { SkeletonCard } from "./Skeletons";

interface ReelsSectionProps {
  state: FetchState<PartialListResult<ContentItem>>;
}

export function ReelsSection({ state }: ReelsSectionProps) {
  return (
    <section id="reels" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading number="04" title="Reels Performance" />

      {state.status === "loading" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {state.status === "error" && (
        <ErrorNotice sectionLabel="Reels" detail={state.message} isTokenError={state.isTokenError} />
      )}

      {state.status === "success" && <ReelsContent result={state.data} />}
    </section>
  );
}

function ReelsContent({ result }: { result: PartialListResult<ContentItem> }) {
  const reels = result.data;

  if (reels.length === 0) {
    return <EmptyState message="No Reels published in this period" />;
  }

  const { best, lowest, tooNewCount } = bestAndLowestSettled(reels);

  return (
    <div className="space-y-6">
      {result.errors.length > 0 && (
        <p className="text-xs text-ink-muted">
          {result.errors.length} Reel{result.errors.length === 1 ? "" : "s"} could not be loaded and {result.errors.length === 1 ? "is" : "are"} left out.
        </p>
      )}

      <div className="space-y-4">
        <RankingNote tooNewCount={tooNewCount} total={reels.length} minAgeDays={MIN_RANKING_AGE_DAYS} noun="Reel" />
        {best && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ContentCard label="BEST" item={best} />
            {lowest && lowest.id !== best.id && <ContentCard label="LOWEST" item={lowest} />}
          </div>
        )}
      </div>

      <SeeAllLink />
    </div>
  );
}
