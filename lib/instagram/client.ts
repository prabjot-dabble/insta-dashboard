// Low-level Instagram Graph API client.
//
// This file only knows how to talk to the Graph API: build the URL, attach the server-side
// token, enforce a timeout, and turn error responses into a typed error. It has no knowledge of
// dashboards, KPIs, or specific Instagram fields — that belongs in higher-level modules that call
// graphGet().

const GRAPH_API_HOST = "https://graph.facebook.com";

export class GraphApiError extends Error {
  readonly status: number;
  readonly type?: string;
  readonly code?: number;
  readonly fbtraceId?: string;

  constructor(
    message: string,
    status: number,
    details?: { type?: string; code?: number; fbtraceId?: string }
  ) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
    this.type = details?.type;
    this.code = details?.code;
    this.fbtraceId = details?.fbtraceId;
  }
}

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    fbtrace_id?: string;
  };
}

function requireAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "META_ACCESS_TOKEN is not set. Add it to .env (server-side only, never NEXT_PUBLIC_*)."
    );
  }
  return token;
}

function getApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION || "v25.0";
}

function getTimeoutMs(): number {
  const seconds = Number(process.env.META_REQUEST_TIMEOUT_SECONDS);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 15) * 1000;
}

/**
 * Perform a GET request against the Instagram Graph API.
 *
 * The access token is sent via the Authorization header (not a query string) so it never ends up
 * in a logged URL. Callers never see or handle the token directly.
 */
export async function graphGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const token = requireAccessToken();
  const version = getApiVersion();
  const url = new URL(`${GRAPH_API_HOST}/${version}/${path.replace(/^\/+/, "")}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs());

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GraphApiError(`Graph API request to "${path}" timed out`, 504);
    }
    throw new GraphApiError(
      `Graph API request to "${path}" failed before a response was received: ${
        err instanceof Error ? err.message : "unknown network error"
      }`,
      502
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const body = (await response.json().catch(() => null)) as (T & MetaErrorBody) | null;

  if (!response.ok || (body && "error" in body && body.error)) {
    const metaError = body?.error;
    throw new GraphApiError(
      metaError?.message ?? `Graph API request to "${path}" failed with status ${response.status}`,
      response.status || 502,
      {
        type: metaError?.type,
        code: metaError?.code,
        fbtraceId: metaError?.fbtrace_id,
      }
    );
  }

  return body as T;
}

export function getGraphApiVersion(): string {
  return getApiVersion();
}
