// GET /api/instagram/trends
//
// Fixed 3-month trend (see lib/instagram/service.ts#getThreeMonthTrend) — "three" is decided by
// the service layer's lastNCalendarMonths(3) call, not a query parameter here.

import { NextRequest, NextResponse } from "next/server";
import { apiErrorStatus, getThreeMonthTrend, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "true";

  try {
    const data = await getThreeMonthTrend(instagramBusinessId, forceRefresh);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
