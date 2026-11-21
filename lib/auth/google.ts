// "Sign in with Google" using the standard OpenID Connect authorization-code flow with PKCE,
// talking straight to Google's public endpoints — no auth library, no paid service.
//
// Flow: /api/auth/login creates state + nonce + PKCE verifier (kept in a signed, short-lived
// cookie) and redirects to Google -> Google redirects back to /api/auth/callback with a code ->
// we swap the code for an ID token (server-to-server, with the client secret and PKCE verifier)
// -> check the token's claims and the email allowlist -> set the session cookie.

import { createHash, randomBytes } from "node:crypto";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

/** GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, or null when sign-in isn't configured yet. */
export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** The exact callback URL registered in Google Cloud. AUTH_URL pins it (recommended when
 *  deployed); otherwise it's derived from the request's own origin. */
export function redirectUri(requestOrigin: string): string {
  const base = (process.env.AUTH_URL?.trim() || requestOrigin).replace(/\/+$/, "");
  return `${base}/api/auth/callback`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** PKCE S256 challenge for a verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizeUrl(params: { clientId: string; redirectUri: string; state: string; nonce: string; codeVerifier: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", pkceChallenge(params.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export interface IdTokenClaims {
  iss: string;
  aud: string;
  exp: number;
  email: string;
  email_verified: boolean;
  nonce: string;
  name?: string;
}

/** Decodes a JWT's payload without checking the signature (see validateIdTokenClaims for why
 *  that is safe here). Returns null for anything malformed. */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Checks the ID token's claims. The token comes straight from Google's token endpoint over HTTPS,
 * in exchange for our client secret and PKCE verifier, so per OpenID Connect Core §3.1.3.7 the TLS
 * connection itself vouches for the issuer and a separate signature check isn't required. The
 * claims are still all checked: right issuer, issued to our client, not expired, matching nonce,
 * and a verified email.
 */
export function validateIdTokenClaims(
  payload: Record<string, unknown> | null,
  expected: { clientId: string; nonce: string },
  now = Date.now()
): { ok: true; claims: IdTokenClaims } | { ok: false; reason: string } {
  if (!payload) return { ok: false, reason: "malformed token" };
  const { iss, aud, exp, email, email_verified, nonce, name } = payload;
  if (typeof iss !== "string" || !GOOGLE_ISSUERS.has(iss)) return { ok: false, reason: "wrong issuer" };
  if (aud !== expected.clientId) return { ok: false, reason: "wrong audience" };
  if (typeof exp !== "number" || exp * 1000 <= now) return { ok: false, reason: "expired token" };
  if (typeof nonce !== "string" || nonce !== expected.nonce) return { ok: false, reason: "nonce mismatch" };
  if (typeof email !== "string" || email_verified !== true) return { ok: false, reason: "email not verified" };
  return {
    ok: true,
    claims: { iss, aud: aud as string, exp, email, email_verified: true, nonce, name: typeof name === "string" ? name : undefined },
  };
}

/** Swaps the one-time authorization code for tokens. Throws on any non-OK response. */
export async function exchangeCode(config: GoogleConfig, code: string, codeVerifier: string, redirect: string): Promise<{ id_token: string }> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { id_token?: string; error?: string } | null;
  if (!response.ok || !body?.id_token) {
    throw new Error(`Google token exchange failed (${response.status}${body?.error ? `: ${body.error}` : ""})`);
  }
  return { id_token: body.id_token };
}
