// Sign-in gate in front of the entire dashboard (pages + API routes alike). Every request needs a
// valid, signed session cookie (see lib/auth/session.ts) issued by "Sign in with Google" for an
// email on ALLOWED_EMAILS. The allowlist is re-checked on every request, so removing someone from
// it locks them out immediately, without waiting for their session to expire.
//
// NOTE ON THE FILE NAME: this is `proxy.ts`, not `middleware.ts`. In the Next.js version this
// project runs (16.3.1), the `middleware.js` file convention is deprecated and renamed to
// `proxy.js` — same behavior, new file/export name (confirmed against this project's own bundled
// docs at node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
// Proxy runs on the Node.js runtime, so node:crypto (used to verify the cookie) is available.
//
// Fails CLOSED: if auth isn't configured (no AUTH_SECRET), nobody gets in.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/auth/access";
import { SESSION_COOKIE, readSessionToken } from "@/lib/auth/session";

/** Reachable without signing in: the login page and the sign-in/out endpoints themselves. */
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/callback", "/api/auth/logout"]);

function unauthenticated(request: NextRequest, error?: string): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  if (error) login.searchParams.set("error", error);
  const response = NextResponse.redirect(login);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();

  let user;
  try {
    user = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    // AUTH_SECRET missing or too short: refuse everything rather than run unprotected.
    return unauthenticated(request, "not_configured");
  }

  if (!user) return unauthenticated(request);
  if (!isEmailAllowed(user.email)) return unauthenticated(request, "not_allowed");

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next's static build assets and the favicon. API routes are deliberately
    // NOT excluded (they serve the same Instagram data), and neither is /_next/image — otherwise
    // anyone could use the server as an image proxy for Meta's CDN without signing in.
    "/((?!_next/static|favicon.ico).*)",
  ],
};
