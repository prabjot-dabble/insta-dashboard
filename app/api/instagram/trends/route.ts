// GET /api/instagram/trends
//
// Fixed 3-month trend (see lib/instagram/service.ts#getThreeMonthTrend) — "three" is decided by
// the service layer's lastNCalendarMonths(3) call, not a query parameter here.

import { NextResponse } from "next/server";
import { apiErrorStatus, getThreeMonthTrend, toApiError } from "@/lib/instagram/service";

export async function GET() {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }

  try {
    const data = await getThreeMonthTrend(instagramBusinessId);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
