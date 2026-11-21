import type { FetchState } from "@/app/lib/useApiData";
import type { DiscoveryData, LabelValue } from "@/app/lib/types";
import { formatCompact, formatDayRange, formatInteger } from "@/app/lib/format";
import { DailyBars, HBarList, SplitBar, Tile, percentOf } from "./Charts";
import { KpiSecondaryRow } from "./Kpi";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice } from "./StatusNotices";
import { SkeletonKpiRow, SkeletonTable } from "./Skeletons";

/**
 * Where the period's reach and views came from. The headline numbers in section 01 are Meta's
 * account totals, which include promoted (ad) activity — this section splits them so organic
 * performance can be read on its own.
 */
export function DiscoverySection({ state }: { state: FetchState<DiscoveryData> }) {
  return (
    <section id="discovery" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading
        number="02"
        title="Reach & Discovery"
        note="Where your audience came from: ads vs organic, followers vs new people."
      />
      {state.status === "loading" && (
        <div className="space-y-6">
          <SkeletonKpiRow />
          <SkeletonTable rows={4} />
        </div>
      )}
      {state.status === "error" && <ErrorNotice sectionLabel="Reach & Discovery" detail={state.message} isTokenError={state.isTokenError} />}
      {state.status === "success" && <DiscoveryContent data={state.data} />}
    </section>
  );
}

function valueOf(list: LabelValue[], label: string): number {
  return list.find((x) => x.label === label)?.value ?? 0;
}

function DiscoveryContent({ data }: { data: DiscoveryData }) {
  const viewsSum = data.views.bySurface.reduce((s, x) => s + x.value, 0);
  const adViews = valueOf(data.views.bySurface, "Ads");
  const organicViews = viewsSum - adViews;
  const interactionsSum = data.interactions.bySurface.reduce((s, x) => s + x.value, 0);
  const organicInteractions = interactionsSum - valueOf(data.interactions.bySurface, "Ads");
  const follow = data.reachByFollow ?? data.viewsByFollow;
  const followMetric = data.reachByFollow ? "reach" : "views";
  const newPeople = valueOf(follow, "NON_FOLLOWER");
  const followers = valueOf(follow, "FOLLOWER");
  const followerGains = data.dailyFollowers.reduce((s, p) => s + p.value, 0);

  return (
    <div className="space-y-6">
      <KpiSecondaryRow
        items={[
          { label: "Views from ads", value: data.views.adShare === null ? "—" : `${data.views.adShare.toFixed(0)}%` },
          { label: "Organic views", value: formatCompact(organicViews) },
          { label: "Organic interactions", value: formatInteger(organicInteractions) },
          { label: "Reached non-followers", value: percentOf(newPeople, newPeople + followers) },
        ]}
      />
      {data.views.adShare !== null && data.views.adShare >= 50 && (
        <p className="text-xs text-ink-muted">
          {formatDayRange(data.dateRange)}: {formatCompact(adViews)} of {formatCompact(viewsSum)} views came from ads, so the totals in
          section 01 mostly reflect paid promotion. Organic content drew {formatCompact(organicViews)} views.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-3">
        <Tile title="Views by source">
          <HBarList items={data.views.bySurface} highlight="Ads" format={formatCompact} />
        </Tile>
        <Tile title="Reach by source">
          <HBarList items={data.reach.bySurface} highlight="Ads" format={formatCompact} showShare={false} />
          <p className="mt-3 text-[11px] text-ink-faint">One person can be reached by more than one source, so these overlap.</p>
        </Tile>
        <Tile title="Interactions by source">
          <HBarList items={data.interactions.bySurface} highlight="Ads" />
        </Tile>
      </div>

      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-2">
        <Tile title={followMetric === "reach" ? "Who you reached" : "Who viewed (reach split needs a range of 30 days or less)"}>
          <SplitBar
            parts={[
              { label: "Not following yet", value: newPeople, tone: "strong" },
              { label: "Followers", value: followers, tone: "soft" },
            ]}
          />
          <p className="mt-3 text-xs text-ink-muted">
            {formatCompact(newPeople)} people who don&apos;t follow you saw your content, against {formatCompact(followers)} followers.
            Includes people reached by ads.
          </p>
        </Tile>
        <Tile title="New followers per day">
          <DailyBars points={data.dailyFollowers} height={72} />
          {data.dailyFollowers.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">{formatInteger(followerGains)} new followers across these days (before unfollows).</p>
          )}
        </Tile>
      </div>

      <Tile title="Daily reach">
        <DailyBars points={data.dailyReach} format={formatCompact} />
      </Tile>
    </div>
  );
}
