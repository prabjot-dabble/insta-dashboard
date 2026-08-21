"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResult } from "./types";

export type FetchState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; isTokenError: boolean }
  | { status: "success"; data: T };

type Resolved<T> = { status: "error"; message: string; isTokenError: boolean } | { status: "success"; data: T };

function withForceRefreshParam(url: string): string {
  return url.includes("?") ? `${url}&refresh=true` : `${url}?refresh=true`;
}

/**
 * Fetches `url` (always one of this app's own /api/instagram/* routes — never graph.facebook.com,
 * never anything Meta-specific) and tracks its own independent loading/error/success state, so
 * one section's failure never affects another section's hook instance.
 *
 * "loading" is DERIVED during render (by comparing the resolved result's request key against the
 * current url+refreshKey) rather than set synchronously inside the effect — calling setState
 * synchronously at the top of an effect body causes an avoidable extra render on every url/
 * refreshKey change, which react-hooks' set-state-in-effect rule flags for exactly that reason.
 * The only setState calls here happen inside the fetch's async .then()/.catch() callbacks, which
 * is the standard, lint-clean pattern for data fetching in an effect.
 *
 * A stale in-flight request whose response arrives after a newer one was started is ignored
 * (requestId guard), so rapid date-range changes or refresh clicks can't show out-of-order data.
 *
 * MANUAL-REFRESH DETECTION: `refreshKey` only ever changes via page.tsx's handleRefresh (a date-
 * range change alone changes `url`, not `refreshKey`). So "refreshKey differs from what THIS hook
 * last saw" is exactly "this fetch was triggered by a manual refresh, not mount or a date-range
 * change" — tracked below via `prevRefreshKeyRef`, compared and updated inside the effect itself.
 * A page.tsx-level flag was deliberately avoided: resetting such a flag after use would itself be
 * a state change that flips the URL back and re-triggers this same effect a second time, causing
 * a spurious duplicate fetch without `refresh=true`. Comparing refreshKey needs no reset — the ref
 * naturally reflects "the last value this hook actually fetched for" going forward.
 *
 * `onSettled` (optional) fires once a fetch resolves, from inside that same async callback — used
 * by the page to update its "Last updated" timestamp without needing its own effect.
 */
export function useApiData<T>(url: string | null, refreshKey: number, onSettled?: () => void): FetchState<T> {
  const requestKey = `${url ?? ""}::${refreshKey}`;
  const [resolved, setResolved] = useState<{ key: string; result: Resolved<T> } | null>(null);
  const requestId = useRef(0);
  const prevRefreshKeyRef = useRef(refreshKey);

  useEffect(() => {
    if (!url) return;
    const thisRequest = ++requestId.current;

    const isManualRefresh = refreshKey !== prevRefreshKeyRef.current;
    prevRefreshKeyRef.current = refreshKey;
    const fetchUrl = isManualRefresh ? withForceRefreshParam(url) : url;

    fetch(fetchUrl)
      .then(async (response) => {
        const body = (await response.json()) as ApiResult<T>;
        if (thisRequest !== requestId.current) return;
        setResolved({
          key: requestKey,
          result: body.ok
            ? { status: "success", data: body.data }
            : { status: "error", message: body.error, isTokenError: body.isTokenError },
        });
        onSettled?.();
      })
      .catch((err: unknown) => {
        if (thisRequest !== requestId.current) return;
        setResolved({
          key: requestKey,
          // A network/JS-level failure never came from Meta at all, so it's never a token error.
          result: {
            status: "error",
            message: err instanceof Error ? err.message : "Failed to load data",
            isTokenError: false,
          },
        });
        onSettled?.();
      });
    // Deliberately keyed on url/refreshKey only — requestKey is derived from them, and onSettled
    // is read fresh from the closure each run without needing to retrigger the fetch itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, refreshKey]);

  if (!resolved || resolved.key !== requestKey) {
    return { status: "loading" };
  }
  return resolved.result;
}
