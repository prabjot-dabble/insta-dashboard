import type { FetchState } from "@/app/lib/useApiData";
import type { PartialListResult, StoryItem } from "@/app/lib/types";
import { formatInteger } from "@/app/lib/format";
import { pickBest, pickLowest } from "@/app/lib/ranking";
import { StoryCard } from "./StoryCard";
import { KpiSecondaryRow } from "./Kpi";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice, EmptyState } from "./StatusNotices";
import { SkeletonCard, SkeletonKpiRow } from "./Skeletons";

interface StoriesSectionProps {
  state: FetchState<PartialListResult<StoryItem>>;
}

/**
 * Sums across the currently-available Stories, treating an individual story's missing metric as
 * "contributes nothing to this total" rather than voiding the whole total — a different, looser
 * convention than the backend's strict per-metric null propagation, appropriate here because this
 * is an aggregate over a LIST, not one authoritative measurement. Returns null only when there is
 * no data at all to sum.
 */
function sumAvailable(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  return known.reduce((total, v) => total + v, 0);
}

export function StoriesSection({ state }: StoriesSectionProps) {
  return (
    <section id="stories" className="mx-auto max-w-7xl px-6 py-14 md:px-10">
      <SectionHeading
        number="05"
        title="Stories"
        note="Story insights are limited by Meta's API availability."
      />

      {state.status === "loading" && (
        <div className="space-y-10">
          <SkeletonKpiRow />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      )}

      {state.status === "error" && <ErrorNotice sectionLabel="Stories" detail={state.message} />}

      {state.status === "success" && <StoriesContent result={state.data} />}
    </section>
  );
}

function StoriesContent({ result }: { result: PartialListResult<StoryItem> }) {
  const stories = result.data;

  if (stories.length === 0) {
    return <EmptyState message="No Stories currently available" />;
  }

  const totalViews = sumAvailable(stories.map((s) => s.views));
  const totalReach = sumAvailable(stories.map((s) => s.reach));
  const totalReplies = sumAvailable(stories.map((s) => s.replies));
  const totalFollows = sumAvailable(stories.map((s) => s.follows));
  const totalProfileVisits = sumAvailable(stories.map((s) => s.profileVisits));

  const best = pickBest(stories, (s) => s.reach, (s) => s.views);
  const lowest = pickLowest(stories, (s) => s.reach, (s) => s.views);

  return (
    <div className="space-y-10">
      {result.errors.length > 0 && (
        <p className="text-xs text-ink-muted">
          {result.errors.length} Stor{result.errors.length === 1 ? "y" : "ies"} could not be loaded and{" "}
          {result.errors.length === 1 ? "is" : "are"} excluded below.
        </p>
      )}

      <div>
        <div className="mb-4 text-xs tracking-wide text-ink-muted uppercase">
          Stories Available — {stories.length}
        </div>
        <KpiSecondaryRow
          items={[
            { label: "Total Views", value: formatInteger(totalViews) },
            { label: "Total Reach", value: formatInteger(totalReach) },
            { label: "Replies", value: formatInteger(totalReplies) },
            { label: "Follows", value: formatInteger(totalFollows) },
            { label: "Profile Visits", value: formatInteger(totalProfileVisits) },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {best && <StoryCard label="BEST" item={best} />}
        {lowest && lowest.id !== best?.id && <StoryCard label="LOWEST" item={lowest} />}
      </div>
    </div>
  );
}
