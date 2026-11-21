// Who may use the dashboard, and small request-safety helpers shared by the proxy and auth routes.

/** ALLOWED_EMAILS="a@dabbleplayart.com, b@dabbleplayart.com" -> normalised set. */
export function parseAllowedEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
  );
}

/** True only for an exact (case-insensitive) match on the list. An empty list lets nobody in. */
export function isEmailAllowed(email: string | null | undefined, raw = process.env.ALLOWED_EMAILS): boolean {
  if (!email) return false;
  return parseAllowedEmails(raw).has(email.trim().toLowerCase());
}

/**
 * Where to send someone after sign-in. Only same-site paths are accepted ("/", "/foo?x=1"), never
 * "//evil.com", "/\\evil.com" or absolute URLs — otherwise the login link could be abused to
 * bounce people to another site (open redirect).
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.includes("\0")) return "/";
  if (next.startsWith("/login") || next.startsWith("/api/auth")) return "/";
  return next.length > 512 ? "/" : next;
}

/** Best-effort client IP for rate limiting (first X-Forwarded-For hop, else a constant bucket). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}

/**
 * A simple in-memory fixed-window rate limiter. Per server process — good enough to slow down
 * repeated sign-in attempts on a single server; it resets on restart.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Records an attempt; returns false when the key is over its limit for this window. */
  allow(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  private prune(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

/** Shared limiters: starting sign-in, and Google callbacks (where failed attempts land). */
export const loginLimiter = new RateLimiter(10, 60_000);
export const callbackLimiter = new RateLimiter(20, 60_000);
