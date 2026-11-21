// POST /api/auth/logout — clears the session cookie. POST only (a link or image can't sign
// someone out), and the request must come from this site's own pages (Origin check).

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, error: "Cross-site request rejected" }, { status: 403 });
  }
  const response = NextResponse.redirect(new URL("/login?signed_out=1", request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
