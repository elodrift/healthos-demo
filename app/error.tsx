"use client";

/**
 * Route-level error boundary.
 *
 * Before this existed, an unhandled render error anywhere under app/ produced
 * Next's default error screen in development and a bare white page in
 * production. For an app someone opens every day to log a meal, a white page is
 * indistinguishable from the product being broken permanently, and the most
 * likely response is to stop opening it.
 *
 * The copy follows the same rule as the rest of the app: say what is actually
 * known. The user's logged data is on the server and is unaffected by a render
 * failure, so saying so is true and is the thing they will want to know.
 */

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // `digest` is the server-side hash Next puts in the logs. Printing it here is
    // what makes a user's report ("it said c7f2a1") joinable to the stack trace.
    // Wire this to Sentry.captureException(error) when monitoring is added.
    console.error(
      JSON.stringify({
        level: "error",
        event: "render.boundary",
        digest: error.digest ?? null,
        err: error.message,
      }),
    );
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-[17px] font-semibold tracking-tight text-ink-hi">
        This screen did not load.
      </h1>
      <p className="text-[13px] leading-relaxed text-ink-mid">
        Something failed while rendering. Nothing you have logged is affected —
        your meals and plan are stored on the server, not in this page.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-base-700 bg-base-850 px-3 py-2 text-[13px] text-ink-hi"
        >
          Try again
        </button>
        <a
          href="/live"
          className="rounded-lg border border-base-700 px-3 py-2 text-[13px] text-ink-mid"
        >
          Go to today
        </a>
      </div>
      {error.digest ? (
        <p className="text-[11px] text-ink-lo">
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
    </main>
  );
}
