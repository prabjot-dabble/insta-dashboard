// Presentation-only formatting for the dashboard UI. Pure functions, no business logic — every
// number here has already been computed by the backend (lib/instagram/kpis.ts and service.ts);
// this file only decides how it LOOKS. `null`/`undefined` always render as "—", never "0" — the
// distinction between "no data" and "confirmed zero" is established all the way through the
// backend and must not be erased at the last step.

const EM_DASH = "—";

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

/** "1.42M" / "214.9K" style — used only where a raw value would otherwise run to 6-7 digits and
 *  overwhelm the layout (account-level Views). Values under 1,000 fall back to a plain integer. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatInteger(value);
}

export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  return `${value.toFixed(decimals)}%`;
}

/** For deltas: "+18.4%" / "-12.1%" / "0.0%" — sign is always explicit for a positive change. */
export function formatSignedPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  const formatted = value.toFixed(decimals);
  return value > 0 ? `+${formatted}%` : `${formatted}%`;
}

/** For absolute-change columns: "+1,204" / "-88" / "0". */
export function formatSignedInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH;
  const rounded = Math.round(value);
  const magnitude = formatInteger(Math.abs(rounded));
  if (rounded > 0) return `+${magnitude}`;
  if (rounded < 0) return `-${magnitude}`;
  return magnitude;
}

/** Reel/Story watch-time metrics arrive from Meta in milliseconds — never shown as raw ms. */
export function formatSecondsFromMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return EM_DASH;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatDurationFromMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return EM_DASH;
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

const IST_READABLE_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "16 Aug 2026" — the CEO never sees a raw ISO timestamp. */
export function formatDate(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return EM_DASH;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return IST_READABLE_DATE.format(date);
}

/** "16 Aug" without the year, for tight table columns / chart labels. */
export function formatDateShort(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return EM_DASH;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(date);
}

const IST_WEEKDAY = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short" });

/** "Fri" — short weekday tag shown alongside a compact date in table rows. */
export function formatWeekday(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return EM_DASH;
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return EM_DASH;
  return IST_WEEKDAY.format(date);
}

/** "2026-08" -> "Aug 2026", for trend chart period labels. */
export function formatMonthLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatRelativeTime(date: Date | null): string {
  if (!date) return EM_DASH;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/** Truncates a caption cleanly on a word boundary rather than mid-word. */
export function truncateCaption(caption: string | null, maxLength = 90): string {
  if (!caption) return "No caption";
  if (caption.length <= maxLength) return caption;
  const cut = caption.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : maxLength)}…`;
}
