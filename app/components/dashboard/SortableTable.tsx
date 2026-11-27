"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  /** Omit for non-sortable columns (e.g. a thumbnail). Return null to sort that row last,
   *  regardless of direction — matching the rest of the app's null-never-treated-as-zero rule. */
  sortValue?: (item: T) => number | string | null;
  align?: "left" | "right";
}

interface SortableTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  defaultSortKey?: string;
  defaultSortDirection?: "asc" | "desc";
  getRowKey: (item: T) => string;
}

/**
 * Client-side only — sorts data the API has already supplied, no additional requests. Nulls
 * always sort to the bottom (in either direction) rather than being coerced to 0, which would
 * otherwise make "no data" look like "the worst real value."
 */
export function SortableTable<T>({
  columns,
  data,
  defaultSortKey,
  defaultSortDirection = "desc",
  getRowKey,
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDirection);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return data;
    const sortValue = col.sortValue;

    return [...data].sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, columns, sortKey, sortDir]);

  function handleSort(col: ColumnDef<T>) {
    if (!col.sortValue) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("desc");
    }
  }

  // Columns with no sort value (thumbnail, caption, type) identify the row; the rest are metrics.
  const leadColumns = columns.filter((c) => !c.sortValue);
  const metricColumns = columns.filter((c) => c.sortValue);

  return (
    <>
      {/* Phones: one card per row, with a sort menu in place of clickable headers. */}
      <div className="space-y-3 md:hidden">
        <div className="flex items-center gap-2">
          <label className="label-caps shrink-0" htmlFor={`sort-${columns.map((c) => c.key).join("-")}`}>
            Sort by
          </label>
          <div className="relative flex-1">
            <select
              id={`sort-${columns.map((c) => c.key).join("-")}`}
              value={sortKey ?? ""}
              onChange={(e) => {
                setSortKey(e.target.value);
                setSortDir("desc");
              }}
              className="w-full appearance-none rounded border border-border bg-surface py-2 pr-8 pl-3 text-sm text-ink shadow-sm focus:border-accent"
            >
              {metricColumns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.header}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-ink-faint">▾</span>
          </div>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            aria-label={sortDir === "asc" ? "Sorted lowest first; switch to highest first" : "Sorted highest first; switch to lowest first"}
            className="rounded border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm active:scale-[0.96]"
          >
            {sortDir === "asc" ? "↑ Low" : "↓ High"}
          </button>
        </div>

        <ul className="space-y-3">
          {sorted.map((item) => (
            <li key={getRowKey(item)} className="card p-3">
              <div className="flex min-w-0 items-center gap-3">
                {leadColumns.map((col) => (
                  <div key={col.key} className={col.header ? "min-w-0 flex-1 text-sm" : "shrink-0"}>
                    {col.render(item)}
                  </div>
                ))}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5 rounded bg-surface-sunken p-3">
                {metricColumns.map((col) => (
                  <div key={col.key} className="min-w-0">
                    <dt className={`label-caps truncate text-[10px] ${sortKey === col.key ? "text-accent!" : ""}`}>{col.header}</dt>
                    <dd className="tabular-nums mt-0.5 text-[13px] text-ink">{col.render(item)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden overflow-x-auto card md:block">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              {columns.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    className={`label-caps px-4 py-3.5 transition-colors duration-150 ease-spring ${
                      col.align === "right" ? "text-right" : "text-left"
                    } ${active ? "text-accent!" : ""} ${col.sortValue ? "cursor-pointer select-none hover:text-ink!" : ""}`}
                    onClick={() => handleSort(col)}
                  >
                    {col.header}
                    {active && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr
                key={getRowKey(item)}
                className="border-b border-border transition-colors duration-150 ease-spring last:border-b-0 hover:bg-surface-sunken"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`tabular-nums px-4 py-3 ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          </table>
      </div>
    </>
  );
}
