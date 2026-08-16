// The dashboard never computes date ranges itself — it only ever sends a preset name or an
// explicit since/until pair to the backend and lets lib/instagram/dateRange.ts (server-side)
// resolve it. This avoids re-implementing (and risking drift from) the Asia/Kolkata-aware date
// logic that already exists on the server.

import type { DateRangePreset } from "./types";

export type DateSelection = { type: "preset"; preset: DateRangePreset } | { type: "custom"; since: string; until: string };

export const DATE_PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7days", label: "Last 7 Days" },
  { value: "last30days", label: "Last 30 Days" },
  { value: "thismonth", label: "This Month" },
  { value: "lastmonth", label: "Last Month" },
];

export const DEFAULT_DATE_SELECTION: DateSelection = { type: "preset", preset: "thismonth" };

/** Query string fragment (no leading "?") to append to a date-range-aware API route. */
export function dateSelectionToQuery(selection: DateSelection): string {
  if (selection.type === "custom") {
    return `since=${encodeURIComponent(selection.since)}&until=${encodeURIComponent(selection.until)}`;
  }
  return `range=${encodeURIComponent(selection.preset)}`;
}

export function dateSelectionLabel(selection: DateSelection): string {
  if (selection.type === "custom") return `${selection.since} – ${selection.until}`;
  return DATE_PRESET_OPTIONS.find((o) => o.value === selection.preset)?.label ?? selection.preset;
}
