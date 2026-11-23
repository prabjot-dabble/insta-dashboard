// Polished loading placeholders — the dashboard never shows a blank screen while a section's data
// is in flight. Sections load independently, so each uses whichever of these matches its shape.

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-strong ${className}`} />;
}

export function SkeletonKpiHero() {
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card space-y-3 p-4 md:p-6">
          <Block className="h-3 w-16" />
          <Block className="h-10 w-24" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Block className="h-2.5 w-16" />
          <Block className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card flex gap-5 p-5">
      <Block className="h-32 w-32 shrink-0" />
      <div className="flex-1 space-y-3">
        <Block className="h-3 w-16" />
        <Block className="h-4 w-3/4" />
        <Block className="h-4 w-1/2" />
        <div className="grid grid-cols-4 gap-3 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Block key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Block className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Block key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function SkeletonChartGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Block className="h-3 w-16" />
          <Block className="h-28 w-full" />
        </div>
      ))}
    </div>
  );
}
