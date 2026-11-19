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

  return (
    <div className="overflow-x-auto bg-surface">
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
  );
}
