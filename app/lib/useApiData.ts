"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResult } from "./types";

export type FetchState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: T };

type Resolved<T> = { status: "error"; message: string } | { status: "success"; data: T };

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
 * `onSettled` (optional) fires once a fetch resolves, from inside that same async callback — used
 * by the page to update its "Last updated" timestamp without needing its own effect.
 */
export function useApiData<T>(url: string | null, refreshKey: number, onSettled?: () => void): FetchState<T> {
  const requestKey = `${url ?? ""}::${refreshKey}`;
  const [resolved, setResolved] = useState<{ key: string; result: Resolved<T> } | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!url) return;
    const thisRequest = ++requestId.current;

    fetch(url)
      .then(async (response) => {
        const body = (await response.json()) as ApiResult<T>;
        if (thisRequest !== requestId.current) return;
        setResolved({
          key: requestKey,
          result: body.ok ? { status: "success", data: body.data } : { status: "error", message: body.error },
        });
        onSettled?.();
      })
      .catch((err: unknown) => {
        if (thisRequest !== requestId.current) return;
        setResolved({
          key: requestKey,
          result: { status: "error", message: err instanceof Error ? err.message : "Failed to load data" },
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
