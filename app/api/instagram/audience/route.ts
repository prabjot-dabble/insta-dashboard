// GET /api/instagram/audience — follower demographics, this month's engaged audience, and the
// followers-online heatmap (last ~30 days). Not date-range based: Meta only offers these as
// lifetime / this-month snapshots. See lib/instagram/extras.ts#getAudience.

import { NextRequest, NextResponse } from "next/server";
import { getAudience } from "@/lib/instagram/extras";
import { apiErrorStatus, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "true";
  try {
    return NextResponse.json({ ok: true, data: await getAudience(instagramBusinessId, forceRefresh) });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
