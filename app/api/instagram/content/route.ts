// GET /api/instagram/content?range=last30days  (or ?since=&until=)
//
// Posts + Carousels together, from one shared underlying media fetch (see
// lib/instagram/service.ts#getFeedContent) — not two separate fetches. Returns
// {ok, data: PartialListResult} rather than {ok, data: [...]} directly: some items may have
// failed to fetch insights without the whole request failing (see the `warnings`/`errors` arrays).

import { NextRequest, NextResponse } from "next/server";
import { parseDateRangeFromSearchParams } from "@/lib/instagram/dateRange";
import { apiErrorStatus, getFeedContent, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }

  let range;
  try {
    range = parseDateRangeFromSearchParams(new URL(request.url).searchParams);
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }

  try {
    const data = await getFeedContent(instagramBusinessId, range);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
