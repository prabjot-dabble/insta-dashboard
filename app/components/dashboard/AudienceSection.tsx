import type { FetchState } from "@/app/lib/useApiData";
import type { AudienceData, LabelValue } from "@/app/lib/types";
import { formatInteger } from "@/app/lib/format";
import { HBarList, SplitBar, Tile, percentOf } from "./Charts";
import { SectionHeading } from "./SectionHeading";
import { ErrorNotice } from "./StatusNotices";
import { SkeletonChartGrid } from "./Skeletons";

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string): string {
  try {
    return COUNTRY_NAMES.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Who follows the account, and who actually engaged this month. Snapshot data — not affected by
 *  the date-range selector, because Meta only offers it as a current snapshot. */
export function AudienceSection({ state, number }: { state: FetchState<AudienceData>; number: string }) {
  return (
    <section id="audience" className="mx-auto max-w-[1360px] px-5 py-8 md:px-12 md:py-10">
      <SectionHeading number={number} title="Audience" note="Current snapshot from Meta. Not affected by the date range above." />
      {state.status === "loading" && <SkeletonChartGrid count={4} />}
      {state.status === "error" && <ErrorNotice sectionLabel="Audience" detail={state.message} isTokenError={state.isTokenError} />}
      {state.status === "success" && <AudienceContent data={state.data} />}
    </section>
  );
}

function share(list: LabelValue[], label: string): number {
  const total = list.reduce((s, x) => s + x.value, 0);
  return total ? (list.find((x) => x.label === label)?.value ?? 0) / total : 0;
}

function AudienceContent({ data }: { data: AudienceData }) {
  const { followers, engagedThisMonth: engaged } = data;
  const followerTotal = followers.age.reduce((s, x) => s + x.value, 0);
  const topAge = [...followers.age].sort((a, b) => b.value - a.value)[0];
  const engagedTopAge = engaged ? [...engaged.age].sort((a, b) => b.value - a.value)[0] : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink">
        {topAge && (
          <>
            Most followers are <strong className="font-semibold">{topAge.label}</strong> ({percentOf(topAge.value, followerTotal)})
          </>
        )}
        {followers.gender.length > 0 && <> and {percentOf(followers.gender.find((g) => g.label === "Women")?.value ?? 0, followers.gender.reduce((s, g) => s + g.value, 0))} are women</>}
        {followers.cities[0] && <>; the biggest city is {followers.cities[0].label.split(",")[0]}</>}.
        {engagedTopAge && engagedTopAge.label !== topAge?.label && (
          <> This month the most engaged group is {engagedTopAge.label}.</>
        )}
      </p>

      <div className="grid grid-cols-1 gap-3 md:gap-6 lg:grid-cols-2">
        <Tile title="Age: followers vs engaged this month">
          <AgeComparison followers={followers.age} engaged={engaged?.age ?? null} />
        </Tile>
        <Tile title="Gender">
          <div className="space-y-5">
            <div>
              <div className="mb-2 text-xs text-ink-muted">Followers</div>
              <SplitBar parts={genderParts(followers.gender)} />
            </div>
            {engaged && (
              <div>
                <div className="mb-2 text-xs text-ink-muted">Engaged this month</div>
                <SplitBar parts={genderParts(engaged.gender)} />
              </div>
            )}
          </div>
        </Tile>
        <Tile title="Top cities (followers)">
          <HBarList items={followers.cities.map((c) => ({ ...c, label: c.label.split(",")[0] }))} total={followerTotal} />
        </Tile>
        <Tile title="Top countries (followers)">
          <HBarList items={followers.countries.map((c) => ({ ...c, label: countryName(c.label) }))} total={followerTotal} />
        </Tile>
      </div>
    </div>
  );
}

function genderParts(list: LabelValue[]) {
  const tone = (label: string) => (label === "Women" ? "strong" : label === "Men" ? "soft" : "muted") as "strong" | "soft" | "muted";
  return ["Women", "Men", "Not specified"]
    .map((label) => ({ label, value: list.find((g) => g.label === label)?.value ?? 0, tone: tone(label) }))
    .filter((p) => p.value > 0);
}

/** Paired bars per age bucket: share of followers vs share of this month's engaged audience. */
function AgeComparison({ followers, engaged }: { followers: LabelValue[]; engaged: LabelValue[] | null }) {
  const max = Math.max(...followers.map((a) => share(followers, a.label)), ...(engaged ?? []).map((a) => share(engaged!, a.label)), 0.01);
  return (
    <div>
      <ul className="space-y-2.5">
        {followers.map((bucket) => {
          const f = share(followers, bucket.label);
          const e = engaged ? share(engaged, bucket.label) : null;
          return (
            <li key={bucket.label} className="grid grid-cols-[52px_1fr_92px] items-center gap-3 text-[13px]">
              <span className="text-ink">{bucket.label}</span>
              <div className="space-y-1">
                <div className="h-1.5 bg-accent-soft" style={{ width: `${(f / max) * 100}%` }} />
                {e !== null && <div className="h-1.5 bg-accent-tint" style={{ width: `${(e / max) * 100}%` }} />}
              </div>
              <span className="tabular-nums text-right text-ink-muted">
                {(f * 100).toFixed(0)}%{e !== null && <span className="text-ink-faint"> · {(e * 100).toFixed(0)}%</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex gap-5 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-accent-soft" /> Followers ({formatInteger(followers.reduce((s, x) => s + x.value, 0))})</span>
        {engaged && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-accent-tint" /> Engaged this month</span>}
      </div>
    </div>
  );
}
