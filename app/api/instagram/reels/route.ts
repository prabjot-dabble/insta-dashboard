// GET /api/instagram/reels?range=last30days  (or ?since=&until=)

import { NextRequest, NextResponse } from "next/server";
import { parseDateRangeFromSearchParams } from "@/lib/instagram/dateRange";
import { apiErrorStatus, getReels, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }

  const searchParams = new URL(request.url).searchParams;
  const forceRefresh = searchParams.get("refresh") === "true";

  let range;
  try {
    range = parseDateRangeFromSearchParams(searchParams);
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }

  try {
    const data = await getReels(instagramBusinessId, range, forceRefresh);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
