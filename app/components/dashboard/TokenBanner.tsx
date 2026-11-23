import type { FetchState } from "@/app/lib/useApiData";
import type { TokenStatus } from "@/app/lib/types";
import { formatDate } from "@/app/lib/format";

const WARN_DAYS = 14;

/** Shows only when the Meta token is invalid or within two weeks of expiring — otherwise nothing. */
export function TokenBanner({ state }: { state: FetchState<TokenStatus> }) {
  if (state.status !== "success") return null;
  const { isValid, daysLeft, expiresAt } = state.data;
  if (isValid && (daysLeft === null || daysLeft > WARN_DAYS)) return null;

  const message = !isValid
    ? "The Instagram access token is no longer valid, so the dashboard can't load new data. Generate a new one in Meta Business settings."
    : `The Instagram access token expires ${daysLeft! <= 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`} (${formatDate(expiresAt)}). Renew it in Meta Business settings before then to avoid a gap in data.`;

  return (
    <div className="notice-enter border-b border-rose-200 bg-negative-wash">
      <div className="mx-auto max-w-[1360px] px-5 py-3 text-sm text-negative md:px-12">⚠ {message}</div>
    </div>
  );
}
