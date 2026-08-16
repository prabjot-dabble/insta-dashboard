import type { FetchState } from "@/app/lib/useApiData";
import type { ContentItem, PartialListResult } from "@/app/lib/types";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice } from "./StatusNotices";
import { SkeletonKpiRow } from "./Skeletons";

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

  return (
    <section id="content-overview" className="mx-auto max-w-7xl px-6 py-14 md:px-10">
      <SectionHeading number="02" title="Content Overview" />

      {loading && <SkeletonKpiRow count={3} />}

      {bothFailed && (
        <ErrorNotice sectionLabel="Content Overview" detail={reelsState.status === "error" ? reelsState.message : undefined} />
      )}

      {!loading && !bothFailed && (
        <div>
          <div className="mb-4 text-xs tracking-wide text-ink-muted uppercase">Content Published</div>
          <div className="grid grid-cols-3 divide-x divide-border border border-border">
            <CountCell label="Reels" value={reelsCount} unavailable={reelsState.status === "error"} />
            <CountCell label="Posts" value={postsCount} unavailable={feedState.status === "error"} />
            <CountCell label="Carousels" value={carouselsCount} unavailable={feedState.status === "error"} />
          </div>
        </div>
      )}
    </section>
  );
}

function CountCell({ label, value, unavailable }: { label: string; value: number | null; unavailable: boolean }) {
  return (
    <div className="px-6 py-6 text-center first:pl-0 last:pr-0">
      <div className="text-xs tracking-wide text-ink-muted uppercase">{label}</div>
      <div className="tabular-nums mt-2 font-display text-4xl text-ink">{unavailable ? "—" : (value ?? "—")}</div>
    </div>
  );
}
