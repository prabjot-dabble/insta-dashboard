import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy: the browser may only load this site's own scripts, styles, fonts and
 * data, plus Instagram/Facebook CDN images. No other site can embed the dashboard in a frame.
 * 'unsafe-inline' scripts are needed for Next.js's inline bootstrap without per-request nonces;
 * 'unsafe-eval' and websockets are added in development only (hot reload).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.fbcdn.net https://*.cdninstagram.com",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Private dashboard: ask search engines never to index it, even if a link leaks.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  // Force HTTPS for a year once served over HTTPS (ignored by browsers on plain http://localhost).
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Meta's CDN serves media/thumbnails from many rotating regional subdomains (e.g.
    // scontent.fblr20-3.fna.fbcdn.net, instagram.fblr20-1.fna.fbcdn.net) — verified against the
    // real Dabble account across Prompts 3-6. Wildcarding the two parent domains covers all of
    // them rather than trying to enumerate specific regional hosts.
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Instagram data and auth responses are private: never stored by browsers or shared caches.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
    ];
  },
};

export default nextConfig;
