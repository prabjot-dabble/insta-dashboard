import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Dabble Instagram Analytics",
  robots: { index: false, follow: false },
};

/** Short, non-technical messages for each failure code the auth routes can send back. */
const MESSAGES: Record<string, string> = {
  not_allowed: "That Google account doesn't have access to this dashboard. Ask the admin to add your email.",
  expired: "The sign-in took too long or was started in another tab. Please try again.",
  cancelled: "Sign-in was cancelled.",
  failed: "Google sign-in didn't complete. Please try again.",
  rate_limited: "Too many sign-in attempts. Wait a minute and try again.",
  not_configured: "Sign-in isn't set up on this server yet (missing Google or AUTH_SECRET settings).",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const error = first(params.error);
  const signedOut = first(params.signed_out) === "1";
  const next = first(params.next);
  // The login route validates `next` again server-side; this only carries it along.
  const href = `/api/auth/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display text-[26px] leading-none font-bold tracking-tight text-ink">Dabble Playart</div>
          <div className="label-caps mt-2 tracking-[0.14em]">Instagram Analytics</div>
        </div>

        <div className="card p-6 md:p-8">
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">Use your Dabble Google account. Access is limited to approved people.</p>

          {error && (
            <p role="alert" className="mt-5 rounded border border-rose-200 bg-negative-wash px-3 py-2.5 text-sm text-negative">
              {MESSAGES[error] ?? MESSAGES.failed}
            </p>
          )}
          {signedOut && !error && <p className="mt-5 rounded border border-blue-200 bg-accent-wash px-3 py-2.5 text-sm text-accent">You&apos;ve been signed out.</p>}

          <a
            href={href}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded border border-border bg-surface shadow-sm px-4 py-3 text-sm font-medium text-ink transition-[border-color,transform] duration-150 ease-spring hover:border-accent active:scale-[0.98]"
          >
            <GoogleMark />
            Sign in with Google
          </a>
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint">Private dashboard. Sign-ins are recorded.</p>
      </div>
    </main>
  );
}

/** Google's multicolour "G" (brand guidelines require it on the sign-in button). */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
