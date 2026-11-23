"use client";

import { useEffect } from "react";

const TOKEN_ERROR_MESSAGE =
  "Instagram access token has expired or is invalid — it needs to be renewed in Meta Business settings.";

interface ErrorNoticeProps {
  sectionLabel: string;
  detail?: string;
  /** True when the underlying failure was Meta error code 190 (expired/invalid access token) —
   *  shows a specific, actionable message instead of the generic "unavailable" one. Same visual
   *  treatment either way. */
  isTokenError?: boolean;
}

/**
 * A section's data failed to load. Shows a short, CEO-appropriate message only — never the raw
 * API error text (which could echo Meta's own wording), never a stack trace. The full technical
 * detail is logged to the console for whoever is debugging, not rendered.
 */
export function ErrorNotice({ sectionLabel, detail, isTokenError = false }: ErrorNoticeProps) {
  useEffect(() => {
    if (detail) {
      console.error(`[dashboard] ${sectionLabel} failed to load: ${detail}`);
    }
  }, [sectionLabel, detail]);

  return (
    <div className="notice-enter flex items-center gap-2 rounded-md border border-rose-200 bg-negative-wash px-4 py-3 text-sm text-negative">
      <span aria-hidden="true">⚠</span>
      <span>{isTokenError ? TOKEN_ERROR_MESSAGE : `${sectionLabel} is unavailable right now.`}</span>
    </div>
  );
}

/** Explains why some (or all) recent items aren't in the Best/Lowest cards. Renders nothing when
 *  every item was old enough to rank. */
export function RankingNote({ tooNewCount, total, minAgeDays, noun }: { tooNewCount: number; total: number; minAgeDays: number; noun: string }) {
  if (tooNewCount === 0) return null;
  const message =
    tooNewCount === total
      ? `${total === 1 ? `This ${noun} is` : `These ${noun}s are`} less than ${minAgeDays} days old — too new to rank as best or lowest yet.`
      : `${tooNewCount} ${noun}${tooNewCount === 1 ? "" : "s"} from the last ${minAgeDays} days ${tooNewCount === 1 ? "isn't" : "aren't"} ranked yet, while ${tooNewCount === 1 ? "its" : "their"} numbers settle.`;
  return <p className="text-xs text-ink-muted">{message}</p>;
}

export function EmptyState({ message = "No data available" }: { message?: string }) {
  return <div className="rounded-md border border-dashed border-border-strong px-4 py-10 text-center text-sm text-ink-muted">{message}</div>;
}
