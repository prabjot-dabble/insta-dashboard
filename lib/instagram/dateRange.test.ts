import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  InvalidDateRangeError,
  chunkDateRangeForInsights,
  dateRangeToUnixWindow,
  last30Days,
  last7Days,
  lastMonth,
  lastMonthToDate,
  daysInRange,
  daysInPeriod,
  firstNDaysOf,
  previousComparableRange,
  lastNCalendarMonths,
  parseDateRangeFromSearchParams,
  thisMonth,
  today,
  todayIst,
  validateDateRange,
  yesterday,
} from "./dateRange.ts";

// A fixed reference instant so every test is deterministic regardless of when it's actually run.
// 2026-08-16T10:00:00Z is 2026-08-16T15:30:00+05:30 IST — safely inside the same IST calendar day.
const REF = new Date("2026-08-16T10:00:00Z");

// ----------------------------------------------------------------------------
// Date range parsing
// ----------------------------------------------------------------------------
describe("date range parsing", () => {
  test("parses a custom since/until pair", () => {
    const params = new URLSearchParams({ since: "2026-06-01", until: "2026-06-30" });
    assert.deepEqual(parseDateRangeFromSearchParams(params), { since: "2026-06-01", until: "2026-06-30" });
  });

  test("parses each named preset without throwing", () => {
    for (const preset of ["today", "yesterday", "last7days", "last30days", "thismonth", "lastmonth"]) {
      const params = new URLSearchParams({ range: preset });
      assert.doesNotThrow(() => parseDateRangeFromSearchParams(params));
    }
  });

  test("defaults to last30days when no params are given", () => {
    const result = parseDateRangeFromSearchParams(new URLSearchParams());
    const expected = last30Days();
    assert.deepEqual(result, expected);
  });

  test("preset names are case-insensitive", () => {
    const params = new URLSearchParams({ range: "Last7Days" });
    assert.deepEqual(parseDateRangeFromSearchParams(params), last7Days());
  });
});

// ----------------------------------------------------------------------------
// Invalid date range
// ----------------------------------------------------------------------------
describe("invalid date range", () => {
  test("since after until throws InvalidDateRangeError", () => {
    assert.throws(() => validateDateRange({ since: "2026-08-10", until: "2026-08-01" }), InvalidDateRangeError);
  });

  test("malformed date strings throw", () => {
    assert.throws(() => validateDateRange({ since: "08/01/2026", until: "2026-08-10" }), InvalidDateRangeError);
  });

  test("a since without a matching until throws via query-param parsing", () => {
    const params = new URLSearchParams({ since: "2026-08-01" });
    assert.throws(() => parseDateRangeFromSearchParams(params), InvalidDateRangeError);
  });

  test("an unknown preset name throws", () => {
    const params = new URLSearchParams({ range: "lastquarter" });
    assert.throws(() => parseDateRangeFromSearchParams(params), InvalidDateRangeError);
  });

  test("a syntactically valid but non-existent calendar date throws", () => {
    assert.throws(() => validateDateRange({ since: "2026-02-30", until: "2026-03-01" }), InvalidDateRangeError);
  });
});

// ----------------------------------------------------------------------------
// 30-day chunking
// ----------------------------------------------------------------------------
describe("chunkDateRangeForInsights", () => {
  test("a range well under 30 days returns a single chunk equal to the input", () => {
    const range = { since: "2026-08-01", until: "2026-08-07" };
    assert.deepEqual(chunkDateRangeForInsights(range), [range]);
  });

  test("30-day exact boundary stays a single chunk", () => {
    // 2026-08-01 .. 2026-08-30 inclusive = exactly 30 calendar days.
    const range = { since: "2026-08-01", until: "2026-08-30" };
    const chunks = chunkDateRangeForInsights(range);
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], range);
  });

  test("31-day range splits into exactly two chunks", () => {
    // 2026-08-01 .. 2026-08-31 inclusive = 31 calendar days.
    const range = { since: "2026-08-01", until: "2026-08-31" };
    const chunks = chunkDateRangeForInsights(range);
    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks[0], { since: "2026-08-01", until: "2026-08-30" });
    assert.deepEqual(chunks[1], { since: "2026-08-31", until: "2026-08-31" });
  });

  test("90-day range splits into exactly three chunks", () => {
    // 2026-06-01 .. 2026-08-29 inclusive = 90 calendar days.
    const range = { since: "2026-06-01", until: "2026-08-29" };
    const chunks = chunkDateRangeForInsights(range);
    assert.equal(chunks.length, 3);
    for (const chunk of chunks) {
      const days = (Date.parse(chunk.until) - Date.parse(chunk.since)) / 86_400_000 + 1;
      assert.ok(days <= 30, `chunk ${chunk.since}..${chunk.until} spans ${days} days`);
    }
  });

  test("no overlapping chunks and no duplicated boundary days across any range length", () => {
    for (const days of [7, 30, 31, 45, 90, 120]) {
      const since = "2026-01-01";
      const until = new Date(Date.parse(since) + (days - 1) * 86_400_000).toISOString().slice(0, 10);
      const chunks = chunkDateRangeForInsights({ since, until });

      for (let i = 1; i < chunks.length; i++) {
        // Each chunk must start exactly one day after the previous chunk ended — no gap, no overlap.
        const prevUntilPlusOne = new Date(Date.parse(chunks[i - 1].until) + 86_400_000).toISOString().slice(0, 10);
        assert.equal(chunks[i].since, prevUntilPlusOne, `gap/overlap between chunk ${i - 1} and ${i} for a ${days}-day range`);
      }

      assert.equal(chunks[0].since, since);
      assert.equal(chunks[chunks.length - 1].until, until);
    }
  });

  test("every chunk is at most 30 calendar days", () => {
    const chunks = chunkDateRangeForInsights({ since: "2026-01-01", until: "2026-12-31" });
    for (const chunk of chunks) {
      const days = (Date.parse(chunk.until) - Date.parse(chunk.since)) / 86_400_000 + 1;
      assert.ok(days <= 30);
    }
  });
});

// ----------------------------------------------------------------------------
// Presets (deterministic via the injected reference date)
// ----------------------------------------------------------------------------
describe("presets", () => {
  test("today/yesterday are single-day ranges anchored to the IST calendar date", () => {
    assert.deepEqual(today(REF), { since: "2026-08-16", until: "2026-08-16" });
    assert.deepEqual(yesterday(REF), { since: "2026-08-15", until: "2026-08-15" });
  });

  test("last7Days includes today as one of the 7 days", () => {
    const range = last7Days(REF);
    assert.equal(range.until, "2026-08-16");
    assert.equal(range.since, "2026-08-10");
    const days = (Date.parse(range.until) - Date.parse(range.since)) / 86_400_000 + 1;
    assert.equal(days, 7);
  });

  test("last30Days is exactly 30 days inclusive — fits Meta's limit without chunking", () => {
    const range = last30Days(REF);
    const chunks = chunkDateRangeForInsights(range);
    assert.equal(chunks.length, 1);
  });

  test("thisMonth runs from the 1st through today (partial month)", () => {
    assert.deepEqual(thisMonth(REF), { since: "2026-08-01", until: "2026-08-16" });
  });

  test("lastMonth is the complete previous calendar month", () => {
    assert.deepEqual(lastMonth(REF), { since: "2026-07-01", until: "2026-07-31" });
  });

  test("lastMonth correctly rolls back across a year boundary", () => {
    const jan = new Date("2026-01-10T10:00:00Z");
    assert.deepEqual(lastMonth(jan), { since: "2025-12-01", until: "2025-12-31" });
  });

  test("lastNCalendarMonths(3) returns 3 periods, oldest first, current month partial", () => {
    const months = lastNCalendarMonths(3, REF);
    assert.equal(months.length, 3);
    assert.deepEqual(
      months.map((m) => m.period),
      ["2026-06", "2026-07", "2026-08"]
    );
    assert.deepEqual(months[2].range, { since: "2026-08-01", until: "2026-08-16" }); // current, partial
    assert.deepEqual(months[1].range, { since: "2026-07-01", until: "2026-07-31" }); // complete
    assert.deepEqual(months[0].range, { since: "2026-06-01", until: "2026-06-30" }); // complete
  });

  test("todayIst reflects the IST calendar date, not the UTC one, near the IST day boundary", () => {
    // 2026-08-16T19:00:00Z = 2026-08-17T00:30:00 IST — already the next day in IST.
    const lateUtc = new Date("2026-08-16T19:00:00Z");
    assert.equal(todayIst(lateUtc), "2026-08-17");
  });
});

// ----------------------------------------------------------------------------
// Unix window conversion
// ----------------------------------------------------------------------------
describe("dateRangeToUnixWindow", () => {
  test("a single-day range covers a full 24-hour IST day", () => {
    const { sinceUnix, untilUnix } = dateRangeToUnixWindow({ since: "2026-08-16", until: "2026-08-16" });
    assert.equal(untilUnix - sinceUnix, 86400);
  });

  test("midnight IST on the since date is earlier than midnight UTC of the same date", () => {
    const { sinceUnix } = dateRangeToUnixWindow({ since: "2026-08-16", until: "2026-08-16" });
    const utcMidnight = Date.parse("2026-08-16T00:00:00Z") / 1000;
    assert.ok(sinceUnix < utcMidnight);
    assert.equal(utcMidnight - sinceUnix, 5.5 * 3600);
  });
});

// ----------------------------------------------------------------------------
// Like-for-like month-on-month and the 30-day reach window
// ----------------------------------------------------------------------------
describe("lastMonthToDate", () => {
  test("covers the same days of the previous month as thisMonth does of the current one", () => {
    assert.deepEqual(thisMonth(REF), { since: "2026-08-01", until: "2026-08-16" });
    assert.deepEqual(lastMonthToDate(REF), { since: "2026-07-01", until: "2026-07-16" });
  });

  test("stops at the previous month's last day when it's shorter", () => {
    const march31 = new Date("2026-03-31T10:00:00Z");
    assert.deepEqual(lastMonthToDate(march31), { since: "2026-02-01", until: "2026-02-28" });
  });

  test("rolls back across a year boundary", () => {
    const jan10 = new Date("2026-01-10T10:00:00Z");
    assert.deepEqual(lastMonthToDate(jan10), { since: "2025-12-01", until: "2025-12-10" });
  });
});

describe("day counting helpers", () => {
  test("daysInRange counts both ends", () => {
    assert.equal(daysInRange({ since: "2026-10-01", until: "2026-10-31" }), 31);
    assert.equal(daysInRange({ since: "2026-11-19", until: "2026-11-19" }), 1);
    assert.equal(daysInRange({ since: "2026-12-30", until: "2027-01-02" }), 4);
  });

  test("daysInPeriod knows month lengths, including leap February", () => {
    assert.equal(daysInPeriod("2026-10"), 31);
    assert.equal(daysInPeriod("2026-11"), 30);
    assert.equal(daysInPeriod("2028-02"), 29);
  });

  test("firstNDaysOf trims a 31-day month to its first 30 days", () => {
    assert.deepEqual(firstNDaysOf({ since: "2026-10-01", until: "2026-10-31" }, 30), { since: "2026-10-01", until: "2026-10-30" });
    assert.deepEqual(firstNDaysOf({ since: "2026-11-01", until: "2026-11-19" }, 30), { since: "2026-11-01", until: "2026-11-19" });
  });
});

describe("previousComparableRange", () => {
  test("month-to-date compares against the same days of last month", () => {
    assert.deepEqual(previousComparableRange({ since: "2026-11-01", until: "2026-11-19" }), { since: "2026-10-01", until: "2026-10-19" });
    assert.deepEqual(previousComparableRange({ since: "2026-03-01", until: "2026-03-31" }), { since: "2026-02-01", until: "2026-02-28" });
  });

  test("a whole month compares against the whole month before", () => {
    assert.deepEqual(previousComparableRange({ since: "2026-10-01", until: "2026-10-31" }), { since: "2026-09-01", until: "2026-09-30" });
    assert.deepEqual(previousComparableRange({ since: "2026-01-01", until: "2026-01-31" }), { since: "2025-12-01", until: "2025-12-31" });
  });

  test("other ranges compare against the same number of days just before", () => {
    assert.deepEqual(previousComparableRange({ since: "2026-11-19", until: "2026-11-19" }), { since: "2026-11-18", until: "2026-11-18" });
    assert.deepEqual(previousComparableRange({ since: "2026-11-13", until: "2026-11-19" }), { since: "2026-11-06", until: "2026-11-12" });
    assert.deepEqual(previousComparableRange({ since: "2026-10-21", until: "2026-11-19" }), { since: "2026-09-21", until: "2026-10-20" });
  });
});
