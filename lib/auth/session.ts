// Signed, tamper-proof cookies for the dashboard's login session (and the short-lived OAuth
// handshake). No database: the cookie carries a small JSON payload plus an HMAC-SHA256 signature
// made with AUTH_SECRET, so the server can trust it without storing anything. Changing
// AUTH_SECRET instantly signs everyone out.
//
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, AUTH_SECRET))

import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "dabble_session";
export const OAUTH_COOKIE = "dabble_oauth";
/** How long a sign-in lasts before Google sign-in is needed again. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
/** How long the user has to finish signing in on Google's page. */
export const OAUTH_MAX_AGE_SECONDS = 10 * 60;

const MIN_SECRET_LENGTH = 32;

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

/** AUTH_SECRET, required and long enough to be unguessable. Throws rather than signing weakly. */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new AuthConfigError(`AUTH_SECRET must be set to a random string of at least ${MIN_SECRET_LENGTH} characters.`);
  }
  return secret;
}

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** Signs `payload` with an expiry `maxAgeSeconds` from now. */
export function signToken(payload: Record<string, unknown>, maxAgeSeconds: number, secret = getAuthSecret(), now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + maxAgeSeconds })).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

/**
 * Returns the payload if the signature is valid and it hasn't expired, otherwise null. Never
 * throws on malformed input — a bad cookie just means "not signed in".
 */
export function verifyToken<T extends Record<string, unknown>>(token: string | undefined, secret = getAuthSecret(), now = Date.now()): (T & { exp: number }) | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = Buffer.from(hmac(body, secret), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface SessionUser {
  email: string;
  name: string | null;
}

export function createSessionToken(user: SessionUser, now = Date.now()): string {
  return signToken({ email: user.email, name: user.name, iat: Math.floor(now / 1000) }, SESSION_MAX_AGE_SECONDS, getAuthSecret(), now);
}

export function readSessionToken(token: string | undefined): SessionUser | null {
  const payload = verifyToken<{ email?: unknown; name?: unknown }>(token);
  if (!payload || typeof payload.email !== "string") return null;
  return { email: payload.email, name: typeof payload.name === "string" ? payload.name : null };
}

/** Cookie options shared by both cookies: not readable by page JavaScript, sent on top-level
 *  navigations back from Google (lax), and HTTPS-only outside local development. */
export function cookieOptions(maxAgeSeconds: number, secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: maxAgeSeconds };
}
