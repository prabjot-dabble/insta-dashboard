// GET /api/auth/callback — Google sends the user back here. Checks the handshake cookie (state,
// nonce, PKCE), swaps the code for an ID token, validates it, checks the email allowlist, then
// issues the session cookie. Every failure lands on /login with a short reason code; details go
// to the server log only.

import { NextRequest, NextResponse } from "next/server";
import { callbackLimiter, clientIp, isEmailAllowed } from "@/lib/auth/access";
import { decodeJwtPayload, exchangeCode, getGoogleConfig, redirectUri, validateIdTokenClaims } from "@/lib/auth/google";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  cookieOptions,
  createSessionToken,
  verifyToken,
} from "@/lib/auth/session";

function fail(request: NextRequest, error: string, logDetail?: string): NextResponse {
  if (logDetail) console.warn(`[auth] sign-in rejected (${error}): ${logDetail}`);
  const response = NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const ip = clientIp(request.headers);
  if (!callbackLimiter.allow(ip)) return fail(request, "rate_limited", `too many callbacks from ${ip}`);

  const config = getGoogleConfig();
  if (!config) return fail(request, "not_configured");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail(request, "cancelled", `Google returned ${params.get("error")}`);

  let handshake: { state?: unknown; nonce?: unknown; codeVerifier?: unknown; next?: unknown } | null;
  try {
    handshake = verifyToken(request.cookies.get(OAUTH_COOKIE)?.value);
  } catch {
    return fail(request, "not_configured");
  }
  const code = params.get("code");
  if (!handshake || typeof handshake.state !== "string" || handshake.state !== params.get("state") || !code) {
    return fail(request, "expired", "missing/expired handshake or state mismatch");
  }

  let claims;
  try {
    const { id_token } = await exchangeCode(config, code, String(handshake.codeVerifier), redirectUri(request.nextUrl.origin));
    const result = validateIdTokenClaims(decodeJwtPayload(id_token), { clientId: config.clientId, nonce: String(handshake.nonce) });
    if (!result.ok) return fail(request, "failed", result.reason);
    claims = result.claims;
  } catch (err) {
    return fail(request, "failed", err instanceof Error ? err.message : "token exchange error");
  }

  if (!isEmailAllowed(claims.email)) return fail(request, "not_allowed", `${claims.email} is not on ALLOWED_EMAILS`);

  console.info(`[auth] signed in: ${claims.email}`);
  const next = typeof handshake.next === "string" ? handshake.next : "/";
  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.delete(OAUTH_COOKIE);
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken({ email: claims.email.toLowerCase(), name: claims.name ?? null }),
    cookieOptions(SESSION_MAX_AGE_SECONDS, request.nextUrl.protocol === "https:")
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
