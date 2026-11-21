import type { FetchState } from "@/app/lib/useApiData";
import type { ContentItem, PartialListResult } from "@/app/lib/types";
import { bestAndLowestSettled, MIN_RANKING_AGE_DAYS, type BestAndLowest } from "@/app/lib/ranking";
import { ContentCard } from "./ContentCard";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice, EmptyState, RankingNote } from "./StatusNotices";
import { SkeletonCard } from "./Skeletons";

interface FeedSectionProps {
  state: FetchState<PartialListResult<ContentItem>>;
}

/** Best and lowest Post and Carousel for the period. The full list of feed content lives in the
 *  Content Performance table (section 12), so it isn't repeated here. */
export function FeedSection({ state }: FeedSectionProps) {
  return (
    <section id="feed" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading number="05" title="Feed Content" />

      {state.status === "loading" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
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
  const posts = result.data.filter((i) => i.contentType === "POST");
  const carousels = result.data.filter((i) => i.contentType === "CAROUSEL");

  if (result.data.length === 0) {
    return <EmptyState message="No Posts or Carousels published in this period" />;
  }

  return (
    <div className="space-y-6">
      {result.errors.length > 0 && (
        <p className="text-xs text-ink-muted">
          {result.errors.length} item{result.errors.length === 1 ? "" : "s"} could not be loaded and{" "}
          {result.errors.length === 1 ? "is" : "are"} left out.
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div>
          <div className="mb-3 text-xs tracking-wide text-ink-muted uppercase">Posts</div>
          {posts.length === 0 ? (
            <EmptyState message="No Posts in this period" />
          ) : (
            <RankedCards ranking={bestAndLowestSettled(posts)} total={posts.length} noun="Post" />
          )}
        </div>
        <div>
          <div className="mb-3 text-xs tracking-wide text-ink-muted uppercase">Carousels</div>
          {carousels.length === 0 ? (
            <EmptyState message="No Carousels in this period" />
          ) : (
            <RankedCards ranking={bestAndLowestSettled(carousels)} total={carousels.length} noun="Carousel" />
          )}
        </div>
      </div>

      <SeeAllLink />
    </div>
  );
}

function RankedCards({ ranking, total, noun }: { ranking: BestAndLowest<ContentItem>; total: number; noun: string }) {
  const { best, lowest, tooNewCount } = ranking;
  return (
    <div className="space-y-4">
      <RankingNote tooNewCount={tooNewCount} total={total} minAgeDays={MIN_RANKING_AGE_DAYS} noun={noun} />
      {best && <ContentCard label="BEST" item={best} />}
      {lowest && lowest.id !== best?.id && <ContentCard label="LOWEST" item={lowest} />}
    </div>
  );
}

/** Points to the one combined table instead of repeating it in every section. */
export function SeeAllLink() {
  return (
    <a href="#content-performance" className="inline-block text-xs text-ink-muted underline-offset-4 hover:text-accent hover:underline">
      See every post in Content Performance ↓
    </a>
  );
}
