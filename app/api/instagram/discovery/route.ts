// GET /api/instagram/discovery?range=… (or since/until) — where reach/views/interactions came
// from (ads vs each organic format), followers vs non-followers, and daily reach/followers.
// See lib/instagram/extras.ts#getDiscovery.

import { NextRequest, NextResponse } from "next/server";
import { parseDateRangeFromSearchParams } from "@/lib/instagram/dateRange";
import { getDiscovery } from "@/lib/instagram/extras";
import { apiErrorStatus, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }
  const searchParams = new URL(request.url).searchParams;
  try {
    const range = parseDateRangeFromSearchParams(searchParams);
    const data = await getDiscovery(instagramBusinessId, range, searchParams.get("refresh") === "true");
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
