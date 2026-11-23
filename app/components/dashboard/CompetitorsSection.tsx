import type { FetchState } from "@/app/lib/useApiData";
import type { CompetitorsData } from "@/app/lib/types";
import { formatInteger } from "@/app/lib/format";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice } from "./StatusNotices";
import { SkeletonTable } from "./Skeletons";

/**
 * Public benchmark against other brands' Instagram accounts (Meta Business Discovery — free).
 * Renders nothing until COMPETITOR_USERNAMES is set in .env, so the CEO never sees a setup note.
 */
export function CompetitorsSection({ state, number }: { state: FetchState<CompetitorsData>; number: string }) {
  if (state.status === "success" && !state.data.configured) return null;
  return (
    <section id="competitors" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading
        number={number}
        title="Competitor Benchmark"
        note="Public numbers only: each account's latest 24 posts. Engagement = average likes + comments per post ÷ followers."
      />
      {state.status === "loading" && <SkeletonTable rows={4} />}
      {state.status === "error" && <ErrorNotice sectionLabel="Competitor Benchmark" detail={state.message} isTokenError={state.isTokenError} />}
      {state.status === "success" && (
        <div className="overflow-x-auto card">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-sunken">
                {["Account", "Followers", "Posts", "Posts / week", "Avg likes", "Avg comments", "Engagement"].map((h, i) => (
                  <th key={h} scope="col" className={`label-caps px-4 py-3.5 ${i === 0 ? "text-left" : "text-right"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...state.data.accounts]
                .sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1))
                .map((a) => (
                  <tr key={a.username} className={`border-b border-border last:border-b-0 ${a.isSelf ? "bg-accent-wash" : ""}`}>
                    <td className="px-4 py-3">
                      <a href={`https://www.instagram.com/${a.username}/`} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">
                        @{a.username}
                      </a>
                      {a.isSelf && <span className="ml-2 text-[10px] font-semibold tracking-[0.12em] text-accent uppercase">You</span>}
                      {a.error && <div className="text-xs text-negative">{a.error}</div>}
                    </td>
                    <td className="tabular-nums px-4 py-3 text-right">{formatInteger(a.followers)}</td>
                    <td className="tabular-nums px-4 py-3 text-right">{formatInteger(a.totalPosts)}</td>
                    <td className="tabular-nums px-4 py-3 text-right">{a.postsPerWeek === null ? "—" : a.postsPerWeek.toFixed(1)}</td>
                    <td className="tabular-nums px-4 py-3 text-right">{a.avgLikes === null ? "—" : formatInteger(Math.round(a.avgLikes))}</td>
                    <td className="tabular-nums px-4 py-3 text-right">{a.avgComments === null ? "—" : formatInteger(Math.round(a.avgComments))}</td>
                    <td className="tabular-nums px-4 py-3 text-right font-semibold text-accent">
                      {a.engagementRate === null ? "—" : `${a.engagementRate.toFixed(2)}%`}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
