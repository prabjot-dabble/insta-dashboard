import type { ReactNode } from "react";

interface SectionHeadingProps {
  number: string;
  title: string;
  note?: ReactNode;
  /** Optional control or link shown on the right of the title (e.g. a filter or "see all"). */
  action?: ReactNode;
}

/** Numbered section header used throughout the dashboard — the numbers mirror the CEO report's
 *  own sequence (01 Overview, 02 Content, ... 08 Content Performance), so they carry real reading
 *  order, not decoration. */
export function SectionHeading({ number, title, note, action }: SectionHeadingProps) {
  return (
    <div className="mb-6 border-b border-border pb-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold tracking-[0.05em] text-accent">{number}</span>
          <h2 className="font-display text-2xl leading-8 font-semibold tracking-[-0.015em] text-ink md:text-[26px] md:leading-[34px]">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {note && <div className="mt-1 text-xs leading-[18px] text-ink-muted">{note}</div>}
    </div>
  );
}
