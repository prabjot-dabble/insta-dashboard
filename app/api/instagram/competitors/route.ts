// GET /api/instagram/competitors — public stats for the accounts listed in COMPETITOR_USERNAMES
// (comma-separated, in .env), alongside our own account. Returns { configured: false } when none
// are set. Only business/creator accounts can be looked up (Meta's Business Discovery rule).

import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/instagram/endpoints";
import { getCompetitors } from "@/lib/instagram/extras";
import { apiErrorStatus, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const instagramBusinessId = process.env.META_INSTAGRAM_BUSINESS_ID;
  if (!instagramBusinessId) {
    return NextResponse.json({ ok: false, error: "META_INSTAGRAM_BUSINESS_ID is not configured" }, { status: 500 });
  }
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "true";
  try {
    const own = process.env.COMPETITOR_USERNAMES ? await getAccount(instagramBusinessId).catch(() => null) : null;
    const data = await getCompetitors(instagramBusinessId, own?.username ?? null, forceRefresh);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
