// HTTP Basic Auth gate in front of the entire dashboard (pages + API routes alike). This is a
// separate auth layer bolted on in front of the existing app — it has no knowledge of, and never
// touches, META_ACCESS_TOKEN or anything in lib/instagram/.
//
// NOTE ON THE FILE NAME: this is `proxy.ts`, not `middleware.ts`. In the Next.js version this
// project runs (16.3.1), the `middleware.js` file convention is deprecated and renamed to
// `proxy.js` — same behavior, new file/export name (confirmed against this project's own bundled
// docs at node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md, per
// AGENTS.md's instruction to check real behavior rather than assume from training data). Proxy
// also now defaults to the Node.js runtime (not Edge), so plain `process.env` access here behaves
// exactly like any other server-side code in this app.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const REALM = "Dabble Instagram Analytics";

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Content-Type": "text/plain",
    },
  });
}

/**
 * Decodes and checks a `Authorization: Basic <base64>` header against the expected credentials.
 * Any malformed input (wrong scheme, bad base64, missing ":") is treated as "not authenticated"
 * rather than thrown — a broken header must never crash the proxy and accidentally fail open.
 */
function hasValidCredentials(authHeader: string | null, expectedUser: string, expectedPassword: string): boolean {
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(authHeader.slice("Basic ".length), "base64").toString("utf-8");
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return user === expectedUser && password === expectedPassword;
}

export function proxy(request: NextRequest): NextResponse {
  // Read directly from process.env here, and only here — no NEXT_PUBLIC_ variants exist for
  // these, so they never ship to the client bundle.
  const expectedUser = process.env.DASHBOARD_USER;
  const expectedPassword = process.env.DASHBOARD_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    // Fail CLOSED: a missing env var in a real deployment must deny access, not accidentally
    // leave the dashboard public. This is deliberately a 500, not a silent NextResponse.next().
    return new NextResponse(
      "Server misconfiguration: DASHBOARD_USER and DASHBOARD_PASSWORD must both be set.",
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  if (!hasValidCredentials(request.headers.get("authorization"), expectedUser, expectedPassword)) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next's own build assets and the favicon — API routes are deliberately
    // NOT excluded, since they serve the same Instagram data the dashboard page displays.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
