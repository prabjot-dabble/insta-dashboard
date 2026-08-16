import type { FetchState } from "@/app/lib/useApiData";
import { formatCompact, formatInteger, formatPercent } from "@/app/lib/format";
import type { OverviewData } from "@/app/lib/types";
import { KpiBreakdownStrip, KpiHeroRow, KpiSecondaryRow } from "./Kpi";
import { SkeletonKpiHero, SkeletonKpiRow } from "./Skeletons";
import { ErrorNotice } from "./StatusNotices";
import { SectionHeading } from "./SectionHeading";

interface OverviewSectionProps {
  state: FetchState<OverviewData>;
}

/**
 * No comparison deltas are shown here, by design: /api/instagram/overview reports the selected
 * period's raw values only — it has no defined "previous period" for an arbitrary date-range
 * selection (unlike /api/instagram/mom, which is always current-vs-previous CALENDAR MONTH). The
 * spec is explicit that a comparison should only ever be shown when the API actually provides
 * one; the true period-over-period comparison lives in Section 06.
 */
export function OverviewSection({ state }: OverviewSectionProps) {
  return (
    <section id="overview" className="mx-auto max-w-7xl px-6 py-14 md:px-10">
      <SectionHeading number="01" title="Instagram at a Glance" />

      {state.status === "loading" && (
        <div className="space-y-10">
          <SkeletonKpiHero />
          <SkeletonKpiRow />
        </div>
      )}

      {state.status === "error" && <ErrorNotice sectionLabel="Instagram Overview" detail={state.message} />}

      {state.status === "success" && (
        <div className="space-y-10">
          <KpiHeroRow
            items={[
              { label: "Followers", value: formatInteger(state.data.followers) },
              { label: "Reach", value: formatInteger(state.data.reach) },
              { label: "Views", value: formatCompact(state.data.views) },
              { label: "Engagement Rate", value: formatPercent(state.data.engagementRate) },
            ]}
          />
          <KpiSecondaryRow
            items={[
              { label: "Profile Views", value: formatInteger(state.data.profileViews) },
              { label: "Website Clicks", value: formatInteger(state.data.websiteClicks) },
              { label: "Accounts Engaged", value: formatInteger(state.data.accountsEngaged) },
              { label: "Total Interactions", value: formatInteger(state.data.totalInteractions) },
            ]}
          />
          <KpiBreakdownStrip
            items={[
              { label: "Likes", value: formatInteger(state.data.likes) },
              { label: "Comments", value: formatInteger(state.data.comments) },
              { label: "Shares", value: formatInteger(state.data.shares) },
              { label: "Saves", value: formatInteger(state.data.saves) },
              { label: "Replies", value: formatInteger(state.data.replies) },
            ]}
          />
        </div>
      )}
    </section>
  );
}
