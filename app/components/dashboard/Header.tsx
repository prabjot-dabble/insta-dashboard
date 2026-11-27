"use client";

import { useState } from "react";
import { DATE_PRESET_OPTIONS, type DateSelection } from "@/app/lib/dateSelection";
import { formatRelativeTime } from "@/app/lib/format";
import type { DateRangePreset } from "@/app/lib/types";

interface HeaderProps {
  dateSelection: DateSelection;
  onDateSelectionChange: (selection: DateSelection) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastUpdated: Date | null;
  /** The signed-in person, once /api/auth/me has answered. */
  user?: { email: string; name: string | null } | null;
}

export function Header({ dateSelection, onDateSelectionChange, onRefresh, isRefreshing, lastUpdated, user }: HeaderProps) {
  const [customSince, setCustomSince] = useState(dateSelection.type === "custom" ? dateSelection.since : "");
  const [customUntil, setCustomUntil] = useState(dateSelection.type === "custom" ? dateSelection.until : "");
  const isCustom = dateSelection.type === "custom";

  function handlePresetChange(value: string) {
    if (value === "custom") {
      onDateSelectionChange({ type: "custom", since: customSince || customUntil, until: customUntil || customSince });
      return;
    }
    onDateSelectionChange({ type: "preset", preset: value as DateRangePreset });
  }

  function applyCustomRange() {
    if (customSince && customUntil) {
      onDateSelectionChange({ type: "custom", since: customSince, until: customUntil });
    }
  }

  const field = "rounded border border-border bg-surface text-sm text-ink transition-colors duration-150 ease-spring focus:border-accent";

  return (
    // Sticky only from tablet up: on a phone a two-row sticky bar would eat a big slice of the screen.
    <header className="z-40 border-b border-border bg-surface/95 backdrop-blur-sm backdrop-saturate-150 md:sticky md:top-0">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-x-3 gap-y-3 px-4 py-3 md:min-h-20 md:justify-start md:px-12 md:py-4">
        <div className="order-1 md:mr-auto">
          <div className="font-display text-[18px] leading-none font-bold tracking-tight text-ink md:text-[20px]">Dabble Playart</div>
          <div className="label-caps mt-1.5 hidden tracking-[0.14em] sm:block">Instagram Analytics</div>
        </div>

        {/* Date controls: a full-width second row on phones, inline on larger screens. */}
        <div className="order-3 flex w-full flex-wrap items-center gap-2 md:order-2 md:w-auto md:gap-3">
          <div className="relative flex-1 md:flex-none">
            <select
              aria-label="Date range"
              value={isCustom ? "custom" : dateSelection.preset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className={`w-full appearance-none py-2 pr-8 pl-3 shadow-sm active:scale-[0.98] md:w-auto ${field}`}
            >
              {DATE_PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-ink-faint">▾</span>
          </div>

          <div className="text-xs whitespace-nowrap text-ink-muted md:order-last">
            Updated {isRefreshing ? "…" : formatRelativeTime(lastUpdated)}
          </div>

          {isCustom && (
            <div className="flex w-full items-center gap-2 md:w-auto">
              <input
                type="date"
                aria-label="Start date"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
                className={`min-w-0 flex-1 px-2 py-1.5 md:flex-none ${field}`}
              />
              <span className="text-ink-faint">–</span>
              <input
                type="date"
                aria-label="End date"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
                className={`min-w-0 flex-1 px-2 py-1.5 md:flex-none ${field}`}
              />
              <button
                type="button"
                onClick={applyCustomRange}
                disabled={!customSince || !customUntil}
                className="rounded border border-accent bg-accent px-3 py-1.5 text-sm text-bg transition-[opacity,transform] duration-150 ease-spring hover:opacity-85 active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        <div className="order-2 flex items-center gap-2 md:order-3 md:gap-3">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh data"
            className="flex items-center gap-2 rounded border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-[color,border-color,transform] duration-150 ease-spring hover:border-accent active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100"
          >
            <span aria-hidden="true" className={isRefreshing ? "animate-spin" : ""}>
              ⟳
            </span>
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {user && (
            <div className="flex items-center gap-3 md:border-l md:border-border md:pl-3">
              <span className="hidden max-w-[180px] truncate text-xs text-ink-muted lg:inline" title={user.email}>
                {user.name ?? user.email}
              </span>
              {/* A real form POST, so signing out works even if page scripts fail. */}
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="rounded border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-[border-color,transform] duration-150 ease-spring hover:border-negative hover:text-negative active:scale-[0.96]"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
