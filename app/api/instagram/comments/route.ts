// GET /api/instagram/comments?range=… — reply rate, questions, common words and the newest
// unanswered comments across the period's posts (up to 25 posts). Reuses the cached media list
// from the Reels/Feed routes, so it only adds one comments call per post that has comments.

import { NextRequest, NextResponse } from "next/server";
import { parseDateRangeFromSearchParams } from "@/lib/instagram/dateRange";
import { getCommentsSummary } from "@/lib/instagram/extras";
import { apiErrorStatus, getFeedContent, getReels, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }
  const searchParams = new URL(request.url).searchParams;
  const forceRefresh = searchParams.get("refresh") === "true";
  try {
    const range = parseDateRangeFromSearchParams(searchParams);
    const [reels, feed] = await Promise.all([
      getReels(instagramBusinessId, range, forceRefresh),
      getFeedContent(instagramBusinessId, range, forceRefresh),
    ]);
    const data = await getCommentsSummary(
      [...reels.data, ...feed.data],
      `${instagramBusinessId}:${range.since}:${range.until}`,
      forceRefresh
    );
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
