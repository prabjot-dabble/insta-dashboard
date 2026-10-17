interface SectionHeadingProps {
  number: string;
  title: string;
  note?: string;
}

/** Numbered section header used throughout the dashboard — the numbers mirror the CEO report's
 *  own sequence (01 Overview, 02 Content, ... 08 Content Performance), so they carry real reading
 *  order, not decoration. */
export function SectionHeading({ number, title, note }: SectionHeadingProps) {
  return (
    <div className="mb-8 border-b border-border pb-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-sans text-sm font-medium text-ink-faint">{number}</span>
        <h2 className="font-display text-3xl leading-none tracking-[-0.01em] text-ink">{title}</h2>
      </div>
      {note && <p className="mt-2 text-xs text-ink-muted">{note}</p>}
    </div>
  );
}
