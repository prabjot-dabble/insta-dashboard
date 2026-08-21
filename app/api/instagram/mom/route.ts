// GET /api/instagram/mom
//
// Fixed current-calendar-month vs previous-calendar-month comparison (see
// lib/instagram/service.ts#getMonthOverMonth). The current month is partial (1st through today) —
// currentRange/previousRange are included in the response so the frontend can represent that
// honestly rather than implying a like-for-like comparison.

import { NextRequest, NextResponse } from "next/server";
import { apiErrorStatus, getMonthOverMonth, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "true";

  try {
    const data = await getMonthOverMonth(instagramBusinessId, forceRefresh);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
