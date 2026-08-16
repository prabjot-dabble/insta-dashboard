// Date-range abstraction for the orchestration layer. Pure calendar/timezone math only — no
// fetch(), no Meta calls, nothing here talks to endpoints.ts directly.
//
// DATE REPRESENTATION
// A DateRange is always { since, until } as "YYYY-MM-DD" strings, BOTH INCLUSIVE, interpreted as
// Asia/Kolkata calendar dates — because Dabble is an India-based business and "today"/"this
// month" etc. should mean what a person in India means by them, not UTC or server-local time.
// Asia/Kolkata has used a single fixed UTC+5:30 offset with no daylight saving since 1945, so
// (unlike most timezones) a fixed-offset conversion is safe indefinitely, not just a shortcut.
//
// This is a distinct concern from Meta's own internal day-bucketing for insights, which was
// observed (see normalize.ts) to align to 07:00 UTC rather than midnight UTC or midnight IST —
// that's Meta's own opaque convention and isn't something this module tries to reproduce. What
// this module guarantees is only: the since/until *instants* handed to the Graph API fully cover
// the requested Asia/Kolkata calendar days. Which of Meta's own daily buckets fall inside that
// window is up to Meta.

export interface DateRange {
  /** Inclusive, "YYYY-MM-DD", Asia/Kolkata calendar date. */
  since: string;
  /** Inclusive, "YYYY-MM-DD", Asia/Kolkata calendar date. */
  until: string;
}

export class InvalidDateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDateRangeError";
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IST_OFFSET_SECONDS = (5 * 60 + 30) * 60;
const MAX_CHUNK_DAYS = 30;

export function validateDateRange(range: DateRange): DateRange {
  if (!range || !DATE_PATTERN.test(range.since) || !DATE_PATTERN.test(range.until)) {
    throw new InvalidDateRangeError(
      `Dates must be "YYYY-MM-DD" strings, got since=${JSON.stringify(range?.since)} until=${JSON.stringify(range?.until)}`
    );
  }
  if (!isValidCalendarDate(range.since) || !isValidCalendarDate(range.until)) {
    // Deliberately not just Number.isNaN(Date.parse(...)): V8 parses "2026-02-30" as a valid
    // instant (silently rolling it over to March), it does not return NaN — so that check alone
    // would let non-existent calendar dates like Feb 30 or Apr 31 through undetected.
    throw new InvalidDateRangeError(`Not a real calendar date: since="${range.since}" until="${range.until}"`);
  }
  if (range.since > range.until) {
    throw new InvalidDateRangeError(`"since" (${range.since}) must not be after "until" (${range.until})`);
  }
  return range;
}

// ----------------------------------------------------------------------------
// Pure calendar-date arithmetic. Deliberately anchored to UTC internally as a neutral counting
// device for "which calendar date is N days from this one" — this is NOT a timezone conversion
// and carries no claim about what timezone the date "is in". The actual Asia/Kolkata meaning is
// only applied once, in dateRangeToUnixWindow below.
// ----------------------------------------------------------------------------

function parseDateParts(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

/** True only if `dateStr` round-trips through a UTC Date unchanged — catches overflow rollovers
 *  like "2026-02-30" (silently becomes March) or "2026-04-31" (becomes May 1). */
function isValidCalendarDate(dateStr: string): boolean {
  const { y, m, d } = parseDateParts(dateStr);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function formatDateUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const { y, m, d } = parseDateParts(dateStr);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateUTC(date);
}

function daysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

const IST_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" for the given instant, as a calendar date in Asia/Kolkata. Accepts an injectable
 *  reference Date so callers (and tests) don't depend on the real wall clock. */
export function todayIst(referenceDate: Date = new Date()): string {
  return IST_DATE_FORMATTER.format(referenceDate);
}

function istDateParts(referenceDate: Date): { y: number; m: number } {
  const { y, m } = parseDateParts(todayIst(referenceDate));
  return { y, m };
}

/**
 * Converts a DateRange (inclusive Asia/Kolkata calendar dates) into the unix-second window Meta's
 * since/until params expect. `since` is the instant of midnight IST on range.since. `until` is the
 * instant of midnight IST on the day AFTER range.until — i.e. an exclusive upper bound that fully
 * covers every second of the `until` day in IST.
 */
export function dateRangeToUnixWindow(range: DateRange): { sinceUnix: number; untilUnix: number } {
  validateDateRange(range);
  return {
    sinceUnix: istMidnightUnix(range.since),
    untilUnix: istMidnightUnix(addDays(range.until, 1)),
  };
}

function istMidnightUnix(dateStr: string): number {
  const { y, m, d } = parseDateParts(dateStr);
  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0);
  return Math.floor(utcMs / 1000) - IST_OFFSET_SECONDS;
}

// ----------------------------------------------------------------------------
// Presets. All accept an optional reference Date for deterministic testing.
// ----------------------------------------------------------------------------

export function today(referenceDate: Date = new Date()): DateRange {
  const d = todayIst(referenceDate);
  return { since: d, until: d };
}

export function yesterday(referenceDate: Date = new Date()): DateRange {
  const d = addDays(todayIst(referenceDate), -1);
  return { since: d, until: d };
}

/** Includes today as one of the 7 days (today and the 6 days before it), matching the common
 *  analytics-dashboard convention for "last N days". */
export function last7Days(referenceDate: Date = new Date()): DateRange {
  const end = todayIst(referenceDate);
  return { since: addDays(end, -6), until: end };
}

/** Includes today; 30 days inclusive fits exactly at Meta's 30-day insights window limit, so this
 *  preset never needs chunking on its own (though the actual account-level fetch may still chunk
 *  if called on a day where that arithmetic lands on 31, e.g. combined with other adjustments —
 *  chunkDateRangeForInsights is applied uniformly regardless, so this is a non-issue in practice). */
export function last30Days(referenceDate: Date = new Date()): DateRange {
  const end = todayIst(referenceDate);
  return { since: addDays(end, -29), until: end };
}

/** 1st of the current Asia/Kolkata month through today — a PARTIAL month once today is anything
 *  but the last day of the month. There is no future data to include. */
export function thisMonth(referenceDate: Date = new Date()): DateRange {
  const { y, m } = istDateParts(referenceDate);
  const since = `${y}-${String(m).padStart(2, "0")}-01`;
  return { since, until: todayIst(referenceDate) };
}

/** The complete previous Asia/Kolkata calendar month (1st through its last day). */
export function lastMonth(referenceDate: Date = new Date()): DateRange {
  const { y, m } = istDateParts(referenceDate);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const since = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const until = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(daysInMonth(prevYear, prevMonth)).padStart(2, "0")}`;
  return { since, until };
}

export interface MonthPeriod {
  /** "YYYY-MM", labeling which calendar month this range covers. */
  period: string;
  range: DateRange;
}

/**
 * The last `n` Asia/Kolkata calendar months, oldest first, ending with the CURRENT month (partial,
 * 1st through today) as the last entry. Every earlier month is a complete calendar month.
 */
export function lastNCalendarMonths(n: number, referenceDate: Date = new Date()): MonthPeriod[] {
  const { y, m } = istDateParts(referenceDate);
  const result: MonthPeriod[] = [];

  for (let i = n - 1; i >= 0; i--) {
    let year = y;
    let month = m - i;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const since = `${period}-01`;
    const isCurrentMonth = i === 0;
    const until = isCurrentMonth
      ? todayIst(referenceDate)
      : `${period}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
    result.push({ period, range: { since, until } });
  }

  return result;
}

// ----------------------------------------------------------------------------
// 30-day chunking (section 3). Meta v25.0 rejects any account-insights request where
// until - since exceeds 30 days. This never touches or duplicates endpoints.ts's own
// assertWithinInsightsWindow guard — that guard stays as the last line of defense; this function
// is what keeps the orchestration layer from ever tripping it in the first place.
// ----------------------------------------------------------------------------

/**
 * Splits `range` into consecutive, non-overlapping windows of at most 30 calendar days each,
 * covering the full range with no gaps and no duplicated boundary days. A range that already fits
 * in 30 days or fewer returns a single chunk equal to the input. Chunk boundaries are fixed
 * 30-day increments from `since`, not aligned to calendar months (an 90-day range yields three
 * equal 30-day chunks, not necessarily "June/July/August") — the only hard requirements are
 * <=30-day windows, no overlap, and no duplicate days, all of which this satisfies regardless of
 * calendar alignment.
 */
export function chunkDateRangeForInsights(range: DateRange): DateRange[] {
  validateDateRange(range);
  const chunks: DateRange[] = [];
  let chunkSince = range.since;

  while (chunkSince <= range.until) {
    const tentativeUntil = addDays(chunkSince, MAX_CHUNK_DAYS - 1);
    const chunkUntil = tentativeUntil < range.until ? tentativeUntil : range.until;
    chunks.push({ since: chunkSince, until: chunkUntil });
    chunkSince = addDays(chunkUntil, 1);
  }

  return chunks;
}

// ----------------------------------------------------------------------------
// Query-param parsing for the API routes.
// ----------------------------------------------------------------------------

const RANGE_PRESETS: Record<string, (referenceDate?: Date) => DateRange> = {
  today,
  yesterday,
  last7days: last7Days,
  last30days: last30Days,
  thismonth: thisMonth,
  lastmonth: lastMonth,
};

/**
 * Reads `?since=&until=` (a custom range, both required together) or `?range=<preset>` (defaults
 * to "last30days" if omitted). Throws InvalidDateRangeError for anything malformed — callers (the
 * API routes) turn that into a structured 400 response via service.ts#toApiError.
 */
export function parseDateRangeFromSearchParams(searchParams: URLSearchParams): DateRange {
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  if (since || until) {
    if (!since || !until) {
      throw new InvalidDateRangeError('Both "since" and "until" must be provided together for a custom range.');
    }
    return validateDateRange({ since, until });
  }

  const presetName = (searchParams.get("range") ?? "last30days").toLowerCase();
  const preset = RANGE_PRESETS[presetName];
  if (!preset) {
    throw new InvalidDateRangeError(
      `Unknown range preset "${presetName}". Valid presets: ${Object.keys(RANGE_PRESETS).join(", ")}; or pass since=&until= explicitly.`
    );
  }
  return preset();
}
