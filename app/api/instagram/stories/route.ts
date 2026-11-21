// GET /api/instagram/stories
//
// No date-range parameter: Meta only exposes currently-active Stories (see
// lib/instagram/service.ts#getStories). Live stories are also saved to the local archive
// (lib/instagram/storyHistory.ts), and the last 30 days of archived ones come back as `history`.

import { NextRequest, NextResponse } from "next/server";
import { apiErrorStatus, getStories, toApiError } from "@/lib/instagram/service";
import { archiveStories, readStoryHistory } from "@/lib/instagram/storyHistory";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "true";

  try {
    const live = await getStories(instagramBusinessId, forceRefresh);
    await archiveStories(
      live.data.map(({ id, timestamp, permalink, views, reach, replies, follows, profileVisits, navigation, taps }) => ({
        id,
        timestamp,
        permalink,
        views,
        reach,
        replies,
        follows,
        profileVisits,
        navigation,
        taps,
      }))
    );
    const history = await readStoryHistory(new Set(live.data.map((s) => s.id)));
    return NextResponse.json({ ok: true, data: { ...live, history } });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
