// GET /api/auth/me — the signed-in user's name and email, for the header. The proxy has already
// rejected anyone without a valid session before this runs.

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const user = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ ok: true, data: user }, { headers: { "Cache-Control": "no-store" } });
}
