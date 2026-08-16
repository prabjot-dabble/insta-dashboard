// Client-side mirror of lib/instagram/kpis.ts's best/lowest ranking criterion: PRIMARY metric,
// SECONDARY tiebreaker, nulls excluded entirely (never treated as zero). Deliberately duplicated
// here rather than imported — nothing under app/ imports from lib/instagram/, even for pure
// functions, so the server/client boundary stays mechanically obvious rather than relying on
// "this particular import happens to be safe."

export function pickBest<T>(
  items: readonly T[],
  getMetric: (item: T) => number | null,
  getTiebreaker: (item: T) => number | null
): T | null {
  return rank(items, getMetric, getTiebreaker, (a, b) => a > b);
}

export function pickLowest<T>(
  items: readonly T[],
  getMetric: (item: T) => number | null,
  getTiebreaker: (item: T) => number | null
): T | null {
  return rank(items, getMetric, getTiebreaker, (a, b) => a < b);
}

function rank<T>(
  items: readonly T[],
  getMetric: (item: T) => number | null,
  getTiebreaker: (item: T) => number | null,
  better: (a: number, b: number) => boolean
): T | null {
  const eligible = items.filter((item) => getMetric(item) !== null);
  if (eligible.length === 0) return null;

  return eligible.reduce((champion, item) => {
    const championMetric = getMetric(champion) as number;
    const itemMetric = getMetric(item) as number;
    if (better(itemMetric, championMetric)) return item;
    if (better(championMetric, itemMetric)) return champion;

    const championTie = getTiebreaker(champion);
    const itemTie = getTiebreaker(item);
    if (itemTie !== null && (championTie === null || better(itemTie, championTie))) return item;
    return champion;
  });
}
