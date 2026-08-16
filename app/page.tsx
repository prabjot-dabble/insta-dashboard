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
import { useApiData } from "@/app/lib/useApiData";
import { DEFAULT_DATE_SELECTION, dateSelectionToQuery, type DateSelection } from "@/app/lib/dateSelection";
import type { ContentItem, MoMData, OverviewData, PartialListResult, StoryItem, TrendData } from "@/app/lib/types";

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
  const storiesState = useApiData<PartialListResult<StoryItem>>("/api/instagram/stories", refreshKey);
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
      />

      <main>
        <OverviewSection state={overviewState} />
        <div className="border-t border-border">
          <ContentOverviewSection reelsState={reelsState} feedState={feedState} />
        </div>
        <div className="border-t border-border">
          <ReelsSection state={reelsState} />
        </div>
        <div className="border-t border-border">
          <FeedSection state={feedState} />
        </div>
        <div className="border-t border-border">
          <StoriesSection state={storiesState} />
        </div>
        <div className="border-t border-border">
          <MoMSection state={momState} />
        </div>
        <div className="border-t border-border">
          <TrendSection state={trendState} />
        </div>
        <div className="border-t border-border">
          <ContentPerformanceSection reelsState={reelsState} feedState={feedState} />
        </div>
      </main>

      <footer className="border-t border-border px-6 py-8 text-center text-xs text-ink-faint md:px-10">
        Dabble Playart — Instagram Organic Analytics
      </footer>
    </div>
  );
}
