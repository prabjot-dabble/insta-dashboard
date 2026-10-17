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
}

export function Header({ dateSelection, onDateSelectionChange, onRefresh, isRefreshing, lastUpdated }: HeaderProps) {
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

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-surface/85 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5 md:px-10">
        <div>
          <div className="font-display text-2xl leading-none tracking-[-0.01em] text-ink">Dabble Playart</div>
          <div className="mt-1 text-xs tracking-wide text-ink-muted uppercase">Instagram Analytics</div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                aria-label="Date range"
                value={isCustom ? "custom" : dateSelection.preset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="appearance-none border border-border-strong bg-surface py-2 pr-8 pl-3 text-sm text-ink transition-colors duration-150 ease-spring focus:border-accent active:scale-[0.98]"
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

            {isCustom && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label="Start date"
                  value={customSince}
                  onChange={(e) => setCustomSince(e.target.value)}
                  className="border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink transition-colors duration-150 ease-spring focus:border-accent"
                />
                <span className="text-ink-faint">–</span>
                <input
                  type="date"
                  aria-label="End date"
                  value={customUntil}
                  onChange={(e) => setCustomUntil(e.target.value)}
                  className="border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink transition-colors duration-150 ease-spring focus:border-accent"
                />
                <button
                  type="button"
                  onClick={applyCustomRange}
                  disabled={!customSince || !customUntil}
                  className="border border-ink bg-ink px-3 py-1.5 text-sm text-bg transition-[opacity,transform] duration-150 ease-spring hover:opacity-85 active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 border border-border-strong bg-surface px-3 py-2 text-sm text-ink transition-[color,border-color,transform] duration-150 ease-spring hover:border-accent active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100"
          >
            <span aria-hidden="true" className={isRefreshing ? "animate-spin" : ""}>
              ⟳
            </span>
            Refresh
          </button>

          <div className="text-xs whitespace-nowrap text-ink-muted">
            Updated {isRefreshing ? "…" : formatRelativeTime(lastUpdated)}
          </div>
        </div>
      </div>
    </header>
  );
}
