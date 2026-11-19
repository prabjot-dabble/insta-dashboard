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

/**
 * Posts younger than this aren't ranked: their reach is still climbing, so a day-old post with a
 * handful of early, engaged viewers can top "best" on engagement rate by chance.
 */
export const MIN_RANKING_AGE_DAYS = 3;
const MIN_RANKING_AGE_MS = MIN_RANKING_AGE_DAYS * 24 * 60 * 60 * 1000;

export interface BestAndLowest<T> {
  best: T | null;
  lowest: T | null;
  /** How many items were left out of the ranking for being too new. */
  tooNewCount: number;
}

/**
 * Best and lowest content by engagement rate (reach breaks ties), counting only items at least
 * MIN_RANKING_AGE_DAYS old. Feed posts, carousels and reels all rank this way.
 */
export function bestAndLowestSettled<T extends { timestamp: string; engagementRate: number | null; reach: number | null }>(
  items: readonly T[],
  now: number = Date.now()
): BestAndLowest<T> {
  const settled = items.filter((item) => {
    const posted = Date.parse(item.timestamp);
    return Number.isNaN(posted) || now - posted >= MIN_RANKING_AGE_MS;
  });
  return {
    best: pickBest(settled, (i) => i.engagementRate, (i) => i.reach),
    lowest: pickLowest(settled, (i) => i.engagementRate, (i) => i.reach),
    tooNewCount: items.length - settled.length,
  };
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
