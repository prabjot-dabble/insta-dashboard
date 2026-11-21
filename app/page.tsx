"use client";

import { useState } from "react";
import { Header } from "@/app/components/dashboard/Header";
import { OverviewSection } from "@/app/components/dashboard/OverviewSection";
import { ContentOverviewSection } from "@/app/components/dashboard/ContentOverviewSection";
import { ReelsSection } from "@/app/components/dashboard/ReelsSection";
import { FeedSection } from "@/app/components/dashboard/FeedSection";
import { StoriesSection } from "@/app/components/dashboard/StoriesSection";
import { MoMSection } from "@/app/components/dashboard/MoMSection";
import { TrendSection } from "@/app/components/dashboard/TrendSection";
import { ContentPerformanceSection } from "@/app/components/dashboard/ContentPerformanceSection";
import { DiscoverySection } from "@/app/components/dashboard/DiscoverySection";
import { CommentsSection } from "@/app/components/dashboard/CommentsSection";
import { AudienceSection } from "@/app/components/dashboard/AudienceSection";
import { BestTimeSection } from "@/app/components/dashboard/BestTimeSection";
import { CompetitorsSection } from "@/app/components/dashboard/CompetitorsSection";
import { TokenBanner } from "@/app/components/dashboard/TokenBanner";
import { useApiData } from "@/app/lib/useApiData";
import { DEFAULT_DATE_SELECTION, dateSelectionToQuery, type DateSelection } from "@/app/lib/dateSelection";
import type {
  AudienceData,
  CommentsData,
  CompetitorsData,
  ContentItem,
  DiscoveryData,
  MoMData,
  OverviewData,
  PartialListResult,
  StoriesData,
  TokenStatus,
  TrendData,
} from "@/app/lib/types";

// The dashboard talks ONLY to this app's own /api/instagram/* routes — never graph.facebook.com,
// never lib/instagram/client.ts or endpoints.ts. The Meta access token never reaches the browser;
// every fetch below hits a same-origin route that already returns clean, normalized JSON.
export default function DashboardPage() {
  const [dateSelection, setDateSelection] = useState<DateSelection>(DEFAULT_DATE_SELECTION);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const rangeQuery = dateSelectionToQuery(dateSelection);

  // Overview is the first section a CEO reads and the fastest to resolve — its completion is used
  // as the "Last Updated" signal rather than coordinating all 6 independent fetches. onSettled
  // fires from inside useApiData's own fetch callback, not synchronously in an effect body here.
  function markUpdated() {
    setLastUpdated(new Date());
    setIsRefreshing(false);
  }

  const overviewState = useApiData<OverviewData>(`/api/instagram/overview?${rangeQuery}`, refreshKey, markUpdated);
  const feedState = useApiData<PartialListResult<ContentItem>>(`/api/instagram/content?${rangeQuery}`, refreshKey);
  const reelsState = useApiData<PartialListResult<ContentItem>>(`/api/instagram/reels?${rangeQuery}`, refreshKey);
  const storiesState = useApiData<StoriesData>("/api/instagram/stories", refreshKey);
  const discoveryState = useApiData<DiscoveryData>(`/api/instagram/discovery?${rangeQuery}`, refreshKey);
  const commentsState = useApiData<CommentsData>(`/api/instagram/comments?${rangeQuery}`, refreshKey);
  const audienceState = useApiData<AudienceData>("/api/instagram/audience", refreshKey);
  const competitorsState = useApiData<CompetitorsData>("/api/instagram/competitors", refreshKey);
  const tokenState = useApiData<TokenStatus>("/api/instagram/token", refreshKey);
  const meState = useApiData<{ email: string; name: string | null }>("/api/auth/me", 0);
  const trendState = useApiData<TrendData>("/api/instagram/trends", refreshKey);
  const momState = useApiData<MoMData>("/api/instagram/mom", refreshKey);

  function handleRefresh() {
    setIsRefreshing(true);
    setRefreshKey((key) => key + 1);
  }

  return (
    <div className="min-h-screen">
      <Header
        dateSelection={dateSelection}
        onDateSelectionChange={setDateSelection}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        lastUpdated={lastUpdated}
        user={meState.status === "success" ? meState.data : null}
      />

      <TokenBanner state={tokenState} />

      <main>
        <OverviewSection state={overviewState} />
        <DiscoverySection state={discoveryState} />
        <div>
          <ContentOverviewSection reelsState={reelsState} feedState={feedState} />
        </div>
        <div>
          <ReelsSection state={reelsState} />
        </div>
        <div>
          <FeedSection state={feedState} />
        </div>
        <div>
          <StoriesSection state={storiesState} number="06" />
        </div>
        <CommentsSection state={commentsState} number="07" />
        <AudienceSection state={audienceState} number="08" />
        <BestTimeSection audienceState={audienceState} reelsState={reelsState} feedState={feedState} number="09" />
        <div>
          <MoMSection state={momState} />
        </div>
        <div>
          <TrendSection state={trendState} />
        </div>
        <div>
          <ContentPerformanceSection reelsState={reelsState} feedState={feedState} />
        </div>
        <CompetitorsSection state={competitorsState} number="13" />
      </main>

      <footer className="mt-10 border-t border-border bg-surface-sunken">
        <div className="mx-auto max-w-[1360px] px-5 py-6 text-xs text-ink-muted md:px-12">
          Dabble Playart — Instagram Analytics
        </div>
      </footer>
    </div>
  );
}
