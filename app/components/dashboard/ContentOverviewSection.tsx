import type { FetchState } from "@/app/lib/useApiData";
import type { ContentItem, PartialListResult } from "@/app/lib/types";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice } from "./StatusNotices";
import { SkeletonKpiRow } from "./Skeletons";
import { KpiSecondaryRow } from "./Kpi";

interface ContentOverviewSectionProps {
  reelsState: FetchState<PartialListResult<ContentItem>>;
  feedState: FetchState<PartialListResult<ContentItem>>;
}

/** Simple published-content counts for the selected period — counts, not performance, per the
 *  spec's "keep it visually simple" instruction. Detailed performance lives in sections 03/04/08. */
export function ContentOverviewSection({ reelsState, feedState }: ContentOverviewSectionProps) {
  const loading = reelsState.status === "loading" || feedState.status === "loading";
  const bothFailed = reelsState.status === "error" && feedState.status === "error";

  const reelsCount = reelsState.status === "success" ? reelsState.data.data.length : null;
  const postsCount =
    feedState.status === "success" ? feedState.data.data.filter((i) => i.contentType === "POST").length : null;
  const carouselsCount =
    feedState.status === "success" ? feedState.data.data.filter((i) => i.contentType === "CAROUSEL").length : null;
  const total = reelsCount !== null && postsCount !== null && carouselsCount !== null ? reelsCount + postsCount + carouselsCount : null;

  return (
    <section id="content-overview" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading number="02" title="Content Overview" />

      {loading && <SkeletonKpiRow count={4} />}

      {bothFailed && (
        <ErrorNotice
          sectionLabel="Content Overview"
          detail={reelsState.status === "error" ? reelsState.message : undefined}
          isTokenError={
            (reelsState.status === "error" && reelsState.isTokenError) ||
            (feedState.status === "error" && feedState.isTokenError)
          }
        />
      )}

      {!loading && !bothFailed && (
        <KpiSecondaryRow
          items={[
            { label: "Total Published", value: total === null ? "—" : String(total) },
            { label: "Reels", value: reelsCount === null ? "—" : String(reelsCount) },
            { label: "Posts", value: postsCount === null ? "—" : String(postsCount) },
            { label: "Carousels", value: carouselsCount === null ? "—" : String(carouselsCount) },
          ]}
        />
      )}
    </section>
  );
}
