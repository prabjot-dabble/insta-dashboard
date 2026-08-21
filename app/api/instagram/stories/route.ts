// GET /api/instagram/stories
//
// No date-range parameter: Meta only exposes currently-active Stories (see
// lib/instagram/service.ts#getStories) — there is nothing to select a historical window over.

import { NextRequest, NextResponse } from "next/server";
import { apiErrorStatus, getStories, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "true";

  try {
    const data = await getStories(instagramBusinessId, forceRefresh);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
