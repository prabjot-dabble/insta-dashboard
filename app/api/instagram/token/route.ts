// GET /api/instagram/token — when the Meta access token expires, so the dashboard can warn ahead
// of time. Returns dates only; the token itself never leaves the server.

import { NextRequest, NextResponse } from "next/server";
import { getTokenStatus } from "@/lib/instagram/extras";
import { apiErrorStatus, toApiError } from "@/lib/instagram/service";

export async function GET(request: NextRequest) {
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "true";
  try {
    return NextResponse.json({ ok: true, data: await getTokenStatus(forceRefresh) });
  } catch (err) {
    return NextResponse.json(toApiError(err), { status: apiErrorStatus(err) });
  }
}
