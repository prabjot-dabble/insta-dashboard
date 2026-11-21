// GET /api/auth/login?next=/path — starts "Sign in with Google". Creates fresh state, nonce and a
// PKCE verifier, keeps them in a signed 10-minute cookie, and redirects to Google.

import { NextRequest, NextResponse } from "next/server";
import { clientIp, loginLimiter, safeNextPath } from "@/lib/auth/access";
import { buildAuthorizeUrl, getGoogleConfig, randomToken, redirectUri } from "@/lib/auth/google";
import { OAUTH_COOKIE, OAUTH_MAX_AGE_SECONDS, cookieOptions, signToken } from "@/lib/auth/session";

function toLogin(request: NextRequest, error: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
}

export async function GET(request: NextRequest) {
  if (!loginLimiter.allow(clientIp(request.headers))) return toLogin(request, "rate_limited");

  const config = getGoogleConfig();
  if (!config) return toLogin(request, "not_configured");

  const state = randomToken();
  const nonce = randomToken();
  const codeVerifier = randomToken(48);
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  let handshake: string;
  try {
    handshake = signToken({ state, nonce, codeVerifier, next }, OAUTH_MAX_AGE_SECONDS);
  } catch {
    return toLogin(request, "not_configured");
  }

  const response = NextResponse.redirect(
    buildAuthorizeUrl({ clientId: config.clientId, redirectUri: redirectUri(request.nextUrl.origin), state, nonce, codeVerifier })
  );
  response.cookies.set(OAUTH_COOKIE, handshake, cookieOptions(OAUTH_MAX_AGE_SECONDS, request.nextUrl.protocol === "https:"));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
