import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { RateLimiter, isEmailAllowed, parseAllowedEmails, safeNextPath } from "./access.ts";
import { buildAuthorizeUrl, decodeJwtPayload, pkceChallenge, validateIdTokenClaims } from "./google.ts";
import { signToken, verifyToken, getAuthSecret, AuthConfigError } from "./session.ts";

const SECRET = "x".repeat(40);
const NOW = Date.parse("2026-11-21T10:00:00Z");

describe("signed session tokens", () => {
  test("round-trips a payload", () => {
    const token = signToken({ email: "a@b.co" }, 60, SECRET, NOW);
    assert.equal(verifyToken<{ email: string }>(token, SECRET, NOW)?.email, "a@b.co");
  });

  test("rejects a tampered payload", () => {
    const token = signToken({ email: "a@b.co" }, 60, SECRET, NOW);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "boss@b.co", exp: NOW / 1000 + 60 })).toString("base64url");
    assert.equal(verifyToken(`${forged}.${sig}`, SECRET, NOW), null);
  });

  test("rejects a token signed with a different secret", () => {
    const token = signToken({ email: "a@b.co" }, 60, "y".repeat(40), NOW);
    assert.equal(verifyToken(token, SECRET, NOW), null);
  });

  test("rejects an expired token", () => {
    const token = signToken({ email: "a@b.co" }, 60, SECRET, NOW);
    assert.equal(verifyToken(token, SECRET, NOW + 61_000), null);
  });

  test("garbage never throws, it just isn't a session", () => {
    for (const bad of [undefined, "", "abc", "a.b.c", ".", "x.", "%%%.%%%"]) assert.equal(verifyToken(bad, SECRET, NOW), null);
  });

  test("refuses to run with a missing or short AUTH_SECRET", () => {
    const saved = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "short";
    try {
      assert.throws(() => getAuthSecret(), AuthConfigError);
    } finally {
      if (saved === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = saved;
    }
  });
});

describe("allowlist", () => {
  test("matches exact emails, case-insensitively", () => {
    const list = " Founder@Dabbleplayart.com, team@dabbleplayart.com ,not-an-email";
    assert.deepEqual([...parseAllowedEmails(list)], ["founder@dabbleplayart.com", "team@dabbleplayart.com"]);
    assert.ok(isEmailAllowed("FOUNDER@dabbleplayart.com", list));
    assert.ok(!isEmailAllowed("founder@dabbleplayart.com.evil.com", list));
    assert.ok(!isEmailAllowed("other@dabbleplayart.com", list));
  });

  test("an empty list lets nobody in", () => {
    assert.ok(!isEmailAllowed("founder@dabbleplayart.com", ""));
    assert.ok(!isEmailAllowed(null, "a@b.co"));
  });
});

describe("post-login redirect", () => {
  test("keeps same-site paths", () => {
    assert.equal(safeNextPath("/"), "/");
    assert.equal(safeNextPath("/?range=lastmonth"), "/?range=lastmonth");
  });

  test("blocks open redirects and auth loops", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil", "/login", "/api/auth/login", null, undefined]) {
      assert.equal(safeNextPath(bad as string), "/");
    }
  });
});

describe("Google ID token checks", () => {
  const good = {
    iss: "https://accounts.google.com",
    aud: "client-123",
    exp: NOW / 1000 + 300,
    email: "founder@dabbleplayart.com",
    email_verified: true,
    nonce: "n-1",
    name: "Founder",
  };
  const expected = { clientId: "client-123", nonce: "n-1" };

  test("accepts a valid token", () => {
    const result = validateIdTokenClaims(good, expected, NOW);
    assert.ok(result.ok);
  });

  test("rejects wrong issuer, audience, nonce, expiry or unverified email", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...good, iss: "https://evil.com" }, "wrong issuer"],
      [{ ...good, aud: "someone-else" }, "wrong audience"],
      [{ ...good, nonce: "replayed" }, "nonce mismatch"],
      [{ ...good, exp: NOW / 1000 - 1 }, "expired token"],
      [{ ...good, email_verified: false }, "email not verified"],
    ];
    for (const [payload, reason] of cases) {
      const result = validateIdTokenClaims(payload, expected, NOW);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.reason, reason);
    }
    assert.equal(validateIdTokenClaims(null, expected, NOW).ok, false);
  });

  test("decodes a JWT payload and rejects malformed ones", () => {
    const jwt = `x.${Buffer.from(JSON.stringify({ a: 1 })).toString("base64url")}.y`;
    assert.deepEqual(decodeJwtPayload(jwt), { a: 1 });
    assert.equal(decodeJwtPayload("not-a-jwt"), null);
  });

  test("authorize URL uses PKCE S256 and requests only basic profile scopes", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "c", redirectUri: "http://localhost:3000/api/auth/callback", state: "s", nonce: "n", codeVerifier: "v" }));
    assert.equal(url.searchParams.get("code_challenge"), pkceChallenge("v"));
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("scope"), "openid email profile");
    assert.equal(url.searchParams.get("state"), "s");
  });
});

describe("rate limiter", () => {
  test("allows up to the limit per window, then blocks, then resets", () => {
    const limiter = new RateLimiter(2, 1000);
    assert.ok(limiter.allow("ip", 0));
    assert.ok(limiter.allow("ip", 10));
    assert.ok(!limiter.allow("ip", 20));
    assert.ok(limiter.allow("other-ip", 20));
    assert.ok(limiter.allow("ip", 1001));
  });
});
