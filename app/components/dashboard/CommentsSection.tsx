import type { FetchState } from "@/app/lib/useApiData";
import type { CommentsData } from "@/app/lib/types";
import { formatDate, formatInteger, truncateCaption } from "@/app/lib/format";
import { Tile } from "./Charts";
import { KpiSecondaryRow } from "./Kpi";
import { SectionHeading } from "./SectionHeading";
import { EmptyState, ErrorNotice } from "./StatusNotices";
import { SkeletonKpiRow, SkeletonTable } from "./Skeletons";

/**
 * What people are saying on this period's posts: reply rate, questions / buying intent, common
 * words, and the newest comments still waiting for a reply. Meta doesn't return commenter
 * usernames for this token, so none are shown.
 */
export function CommentsSection({ state, number }: { state: FetchState<CommentsData>; number: string }) {
  return (
    <section id="comments" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading number={number} title="Comments" note="Top-level comments on posts from the selected period." />
      {state.status === "loading" && (
        <div className="space-y-6">
          <SkeletonKpiRow />
          <SkeletonTable rows={4} />
        </div>
      )}
      {state.status === "error" && <ErrorNotice sectionLabel="Comments" detail={state.message} isTokenError={state.isTokenError} />}
      {state.status === "success" && <CommentsContent data={state.data} />}
    </section>
  );
}

function CommentsContent({ data }: { data: CommentsData }) {
  if (data.totalComments === 0) return <EmptyState message="No comments on posts from this period" />;
  const unansweredCount = data.totalComments - data.answered;

  return (
    <div className="space-y-6">
      <KpiSecondaryRow
        items={[
          { label: "Comments", value: formatInteger(data.totalComments) },
          { label: "Replied to", value: data.answeredRate === null ? "—" : `${data.answeredRate.toFixed(0)}%` },
          { label: "Still unanswered", value: formatInteger(unansweredCount) },
          { label: "Questions & buying intent", value: formatInteger(data.questions) },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-3">
        <Tile title="What people mention most">
          {data.topWords.length === 0 ? (
            <p className="text-xs text-ink-muted">No word comes up more than once yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.topWords.map((w) => (
                <span key={w.label} className="bg-surface-sunken px-2.5 py-1 text-[13px] text-ink">
                  {w.label} <span className="tabular-nums text-ink-faint">{w.value}</span>
                </span>
              ))}
            </div>
          )}
          <p className="mt-4 text-[11px] text-ink-faint">From {data.postsChecked} posts with comments.</p>
        </Tile>

        <Tile title="Newest unanswered comments" className="lg:col-span-2">
          {data.unanswered.length === 0 ? (
            <p className="text-sm text-ink-muted">Every comment has a reply. 🎉</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.unanswered.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      {c.isQuestion && (
                        <span className="mr-2 bg-negative-wash px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-negative uppercase">
                          Needs reply
                        </span>
                      )}
                      {c.text}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">On: {truncateCaption(c.postCaption, 70)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-ink-muted">
                    <span className="tabular-nums">{formatDate(c.timestamp)}</span>
                    {c.permalink && (
                      <a href={c.permalink} target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">
                        Open post ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>
    </div>
  );
}
