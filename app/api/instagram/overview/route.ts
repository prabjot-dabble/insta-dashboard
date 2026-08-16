// GET /api/instagram/overview?range=last30days  (or ?since=YYYY-MM-DD&until=YYYY-MM-DD)
//
// Thin wrapper: parse the date range, call the service layer, return its result or a structured
// error. No Meta request logic, no KPI math, and no caching decisions live in this file — all of
// that belongs to lib/instagram/service.ts.

import { NextRequest, NextResponse } from "next/server";
import { parseDateRangeFromSearchParams } from "@/lib/instagram/dateRange";
import { apiErrorStatus, getOverview, toApiError } from "@/lib/instagram/service";

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
    const data = await getOverview(instagramBusinessId, range);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
