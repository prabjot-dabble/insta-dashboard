"use client";

import { useEffect } from "react";

/**
 * A section's data failed to load. Shows a short, CEO-appropriate message only — never the raw
 * API error text (which could echo Meta's own wording), never a stack trace. The full technical
 * detail is logged to the console for whoever is debugging, not rendered.
 */
export function ErrorNotice({ sectionLabel, detail }: { sectionLabel: string; detail?: string }) {
  useEffect(() => {
    if (detail) {
      console.error(`[dashboard] ${sectionLabel} failed to load: ${detail}`);
    }
  }, [sectionLabel, detail]);

  return (
    <div className="flex items-center gap-2 border border-negative/25 bg-negative-wash px-4 py-3 text-sm text-negative">
      <span aria-hidden="true">⚠</span>
      <span>{sectionLabel} is unavailable right now.</span>
    </div>
  );
}

export function EmptyState({ message = "No data available" }: { message?: string }) {
  return <div className="border border-dashed border-border-strong px-4 py-10 text-center text-sm text-ink-muted">{message}</div>;
}
