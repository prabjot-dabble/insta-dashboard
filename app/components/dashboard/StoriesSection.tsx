import type { FetchState } from "@/app/lib/useApiData";
import type { ArchivedStory, ItemError, StoriesData, StoryItem, StoryTaps } from "@/app/lib/types";
import { formatDate, formatInteger } from "@/app/lib/format";
import { SplitBar, Tile, percentOf } from "./Charts";
import { pickBest, pickLowest } from "@/app/lib/ranking";
import { StoryCard } from "./StoryCard";
import { KpiSecondaryRow } from "./Kpi";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice, EmptyState } from "./StatusNotices";
import { SkeletonCard, SkeletonKpiRow } from "./Skeletons";

interface StoriesSectionProps {
  state: FetchState<StoriesData>;
  number: string;
}

/**
 * Sums across the currently-available Stories, treating an individual story's missing metric as
 * "contributes nothing to this total" rather than voiding the whole total — a different, looser
 * convention than the backend's strict per-metric null propagation, appropriate here because this
 * is an aggregate over a LIST, not one authoritative measurement. Returns null only when there is
 * no data at all to sum.
 */
function sumAvailable(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return null;
  return known.reduce((total, v) => total + v, 0);
}

export function StoriesSection({ state, number }: StoriesSectionProps) {
  return (
    <section id="stories" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading
        number={number}
        title="Stories"
        note="Story insights are limited by Meta's API availability."
      />

      {state.status === "loading" && (
        <div className="space-y-10">
          <SkeletonKpiRow />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      )}

      {state.status === "error" && (
        <ErrorNotice sectionLabel="Stories" detail={state.message} isTokenError={state.isTokenError} />
      )}

      {state.status === "success" && <StoriesContent result={state.data} />}
    </section>
  );
}

function StoriesContent({ result }: { result: StoriesData }) {
  const stories = result.data;
  const hiddenNote = hiddenStoriesNote(result.errors, stories.length);

  return (
    <div className="space-y-10">
      {stories.length === 0 ? (
        <EmptyState message={hiddenNote ?? "No Stories live right now"} />
      ) : (
        <LiveStories stories={stories} hiddenNote={hiddenNote} />
      )}
      {result.history.length > 0 && <StoryHistory history={result.history} />}
    </div>
  );
}

function LiveStories({ stories, hiddenNote }: { stories: StoryItem[]; hiddenNote: string | null }) {

  const totalViews = sumAvailable(stories.map((s) => s.views));
  const totalReach = sumAvailable(stories.map((s) => s.reach));
  const totalReplies = sumAvailable(stories.map((s) => s.replies));
  const totalFollows = sumAvailable(stories.map((s) => s.follows));
  const totalProfileVisits = sumAvailable(stories.map((s) => s.profileVisits));

  // Best/Lowest only means something with at least two stories to compare.
  const canRank = stories.length >= 2;
  const best = canRank ? pickBest(stories, (s) => s.reach, (s) => s.views) : null;
  const lowest = canRank ? pickLowest(stories, (s) => s.reach, (s) => s.views) : null;

  return (
    <div className="space-y-10">
      {hiddenNote && <p className="text-xs text-ink-muted">{hiddenNote}</p>}

      <div>
        <div className="mb-4 text-xs tracking-wide text-ink-muted uppercase">
          Stories Available — {stories.length}
        </div>
        <KpiSecondaryRow
          items={[
            { label: "Total Views", value: formatInteger(totalViews) },
            { label: "Total Reach", value: formatInteger(totalReach) },
            { label: "Replies", value: formatInteger(totalReplies) },
            { label: "Follows", value: formatInteger(totalFollows) },
            { label: "Profile Visits", value: formatInteger(totalProfileVisits) },
          ]}
        />
      </div>

      <StoryDropoff taps={stories.map((s) => s.taps)} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {canRank ? (
          <>
            {best && <StoryCard label="BEST" item={best} />}
            {lowest && lowest.id !== best?.id && <StoryCard label="LOWEST" item={lowest} />}
          </>
        ) : (
          <StoryCard label="LIVE NOW" item={stories[0]} />
        )}
      </div>
    </div>
  );
}

/**
 * Meta withholds a story's insights until enough people have viewed it (error #10, "Not enough
 * viewers"). That's normal for a fresh story, not a failure, so it's explained as such; any other
 * per-story failure gets a plain "couldn't be loaded".
 */
function hiddenStoriesNote(errors: ItemError[], shownCount: number): string | null {
  if (errors.length === 0) return null;
  const tooFewViewers = errors.filter((e) => /not enough viewers/i.test(e.message)).length;
  const other = errors.length - tooFewViewers;
  const parts: string[] = [];
  if (tooFewViewers > 0) {
    const more = shownCount > 0 ? " more" : "";
    parts.push(
      `${tooFewViewers}${more} ${tooFewViewers === 1 ? "Story is" : "Stories are"} live, but Meta hides the numbers until enough people have viewed ${tooFewViewers === 1 ? "it" : "them"}.`
    );
  }
  if (other > 0) parts.push(`${other} ${other === 1 ? "Story" : "Stories"} couldn't be loaded.`);
  return parts.join(" ");
}

function addTaps(list: Array<StoryTaps | null>): StoryTaps | null {
  const known = list.filter((t): t is StoryTaps => t !== null);
  if (known.length === 0) return null;
  return known.reduce((a, t) => ({ forward: a.forward + t.forward, back: a.back + t.back, exit: a.exit + t.exit, nextStory: a.nextStory + t.nextStory }), {
    forward: 0,
    back: 0,
    exit: 0,
    nextStory: 0,
  });
}

/** How viewers moved through the live stories: kept watching, went back, or left. */
function StoryDropoff({ taps }: { taps: Array<StoryTaps | null> }) {
  const total = addTaps(taps);
  if (!total) return null;
  const all = total.forward + total.back + total.exit + total.nextStory;
  if (all === 0) return null;
  const left = total.exit + total.nextStory;
  return (
    <Tile title="How viewers moved through your stories">
      <SplitBar
        parts={[
          { label: "Tapped forward", value: total.forward, tone: "soft" },
          { label: "Tapped back", value: total.back, tone: "strong" },
          { label: "Exited", value: total.exit, tone: "negative" },
          { label: "Swiped to next account", value: total.nextStory, tone: "muted" },
        ]}
      />
      <p className="mt-3 text-xs text-ink-muted">
        {percentOf(left, all)} of taps left your stories (exited or swiped away). Taps back usually mean something was worth a second look.
      </p>
    </Tile>
  );
}

/** Stories the dashboard saved while they were live — Meta itself drops them after 24 hours. */
function StoryHistory({ history }: { history: ArchivedStory[] }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="label-caps">Past stories (last 30 days)</div>
        <div className="text-[11px] text-ink-faint">Saved by this dashboard while each story was live; numbers are the last ones seen.</div>
      </div>
      <div className="table-pin-first overflow-x-auto card">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-sunken">
              {["Posted", "Views", "Reach", "Replies", "Follows", "Profile Visits", "Left early"].map((h, i) => (
                <th key={h} scope="col" className={`label-caps px-4 py-3 ${i === 0 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((s) => {
              const t = s.taps;
              const all = t ? t.forward + t.back + t.exit + t.nextStory : 0;
              return (
                <tr key={s.id} className="border-b border-border last:border-b-0 hover:bg-surface-sunken">
                  <td className="px-4 py-2.5">
                    {s.permalink ? (
                      <a href={s.permalink} target="_blank" rel="noreferrer" className="text-ink hover:text-accent">
                        {formatDate(s.timestamp)}
                      </a>
                    ) : (
                      formatDate(s.timestamp)
                    )}
                  </td>
                  <td className="tabular-nums px-4 py-2.5 text-right">{formatInteger(s.views)}</td>
                  <td className="tabular-nums px-4 py-2.5 text-right">{formatInteger(s.reach)}</td>
                  <td className="tabular-nums px-4 py-2.5 text-right">{formatInteger(s.replies)}</td>
                  <td className="tabular-nums px-4 py-2.5 text-right">{formatInteger(s.follows)}</td>
                  <td className="tabular-nums px-4 py-2.5 text-right">{formatInteger(s.profileVisits)}</td>
                  <td className="tabular-nums px-4 py-2.5 text-right">{t && all > 0 ? percentOf(t.exit + t.nextStory, all) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
