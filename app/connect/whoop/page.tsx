import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { wearableConnection } from "@/lib/db/schema";
import { whoopOriginProblem } from "@/lib/whoop/client";
import { ConnectWhoopButton } from "@/components/whoop/connect-button";
import { DisconnectWhoopButton } from "@/components/whoop/disconnect-button";

export const metadata: Metadata = {
  title: "Connect WHOOP — HealthOS",
  description: "Connect your WHOOP account to run HealthOS in Live mode.",
};

export const dynamic = "force-dynamic";

export default async function ConnectWhoopPage({
  searchParams,
}: {
  searchParams: { error?: string; connected?: string };
}) {
  // Next 14.2: headers() is synchronous.
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) redirect("/sign-in");

  const rows = await db
    .select()
    .from(wearableConnection)
    .where(
      and(
        eq(wearableConnection.userId, session.user.id),
        eq(wearableConnection.provider, "whoop"),
      ),
    )
    .limit(1);

  const conn = rows[0];
  const credentialsMissing =
    !process.env.WHOOP_CLIENT_ID || !process.env.WHOOP_CLIENT_SECRET;

  /*
    Ask the same question the connect route asks, from the same function.

    Without this the page rendered a fully enabled green "Connect WHOOP" button
    on an origin where the route can only bounce it straight back to an error —
    an invitation that cannot be accepted. Checking here means the reason is
    stated before the click, not after.
  */
  const h = headers();
  const runningOrigin = `${h.get("x-forwarded-proto") ?? "https"}://${
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  }`;
  const originProblem = whoopOriginProblem(runningOrigin);

  // Anything that makes the flow impossible disables the button. Kept as one
  // boolean so the button and the footer copy below cannot disagree.
  const cannotConnect = credentialsMissing || originProblem !== null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-green/15 font-mono text-[11px] font-bold text-accent-green"
        >
          OS
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-ink-hi">
          HealthOS
        </span>
      </Link>

      <h1 className="text-pretty text-[26px] font-semibold leading-[1.15] tracking-tight text-ink-hi">
        Connect WHOOP
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-mid">
        Live mode reads last night&apos;s sleep and today&apos;s recovery to
        propose when to eat. Nothing is written back to WHOOP.
      </p>

      {searchParams.error ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-accent-red/30 bg-accent-red/10 px-3.5 py-3 text-[13px] leading-relaxed text-accent-red"
        >
          {searchParams.error}
        </p>
      ) : null}

      {searchParams.connected && conn ? (
        <p className="mt-6 rounded-lg border border-accent-green/30 bg-accent-green/10 px-3.5 py-3 text-[13px] leading-relaxed text-accent-green">
          WHOOP connected. Live mode can now read your recovery and sleep.
        </p>
      ) : null}

      {/* Connection state, stated plainly rather than as a green dot. */}
      <section className="mt-6 rounded-xl border border-base-700 bg-base-850 p-4">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
          Status
        </h2>
        <p className="mt-2 text-[15px] font-medium text-ink-hi">
          {conn ? "Connected" : "Not connected"}
        </p>
        {conn ? (
          <dl className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-lo">Last synced</dt>
              <dd className="text-ink-mid">
                {conn.lastSyncedAt
                  ? conn.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ")
                  : "Never"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-lo">Token expires</dt>
              <dd className="text-ink-mid">
                {conn.expiresAt
                  ? conn.expiresAt.toISOString().slice(0, 16).replace("T", " ")
                  : "Unknown"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-lo">Refresh token</dt>
              <dd className="text-ink-mid">
                {conn.refreshToken ? "Stored" : "Missing"}
              </dd>
            </div>
          </dl>
        ) : null}

        {/* §4.11: report our own failures instead of showing "not connected". */}
        {conn?.syncError ? (
          <p className="mt-3 rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-accent-red">
            Last sync error: {conn.syncError}
          </p>
        ) : null}
      </section>

      {/*
        Shown when the *current* origin cannot complete the flow.

        Rendered even without ?error=, because the user has not clicked anything
        yet — the whole point is to say so before they do. `searchParams.error`
        above covers the post-click case; this covers arriving on the page.
      */}
      {originProblem && !searchParams.error ? (
        <section className="mt-4 rounded-xl border border-base-700 bg-base-900 p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
            Wrong address for this connection
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
            {originProblem}
          </p>
        </section>
      ) : null}

      {credentialsMissing ? (
        <section className="mt-4 rounded-xl border border-base-700 bg-base-900 p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
            Setup needed
          </h2>
          {/*
            Says "not visible to this deployment", not "not set".

            The earlier copy said "not set ... then reload", which cost real
            debugging time: the credentials *were* set in project settings, but
            this build predated them, and reloading a deployed page can never
            pick up new environment variables. The message sent the reader back
            to the dashboard they had already filled in correctly.
          */}
          <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
            <code className="font-mono text-[12px] text-ink-hi">
              WHOOP_CLIENT_ID
            </code>{" "}
            and{" "}
            <code className="font-mono text-[12px] text-ink-hi">
              WHOOP_CLIENT_SECRET
            </code>{" "}
            are not visible to this deployment, so the button below is disabled.
            Add them from your WHOOP developer app, then{" "}
            <strong className="font-semibold text-ink-hi">redeploy</strong> —
            environment variables are read at build time, so if you have already
            added them, reloading this page will not pick them up.
          </p>
        </section>
      ) : null}

      {/*
        A client component, because WHOOP's login sends
        `x-frame-options: SAMEORIGIN` and so cannot render inside the preview
        iframe — the flow has to be opened in a top-level tab when we are framed,
        which is only knowable in the browser.
      */}
      <ConnectWhoopButton connected={Boolean(conn)} disabled={cannotConnect} />

      {/*
        Rendered unconditionally, with `connected` passed in, rather than wrapped
        in `{conn ? ... : null}`.

        The conditional version was a real bug: disconnecting calls
        revalidatePath, the server re-renders with conn === null, the component
        unmounts, and the React state holding the result message is destroyed. The
        user saw no confirmation at all — and the message that matters most, "we
        could not confirm revocation at WHOOP, so remove it there yourself", was
        the one silently discarded. Keeping the element mounted preserves it.
      */}
      <DisconnectWhoopButton connected={Boolean(conn)} />

      {/*
        "You'll be taken to WHOOP" is a promise, so it is only made when the
        button can actually keep it. With the flow blocked it stated the exact
        thing that was failing, directly under a dead button — the same class of
        bug as the old refresh button saying it "pulled fresh data" when nothing
        was pulled. The privacy link is unconditional; only the claim is gated.
      */}
      <p className="mt-3 text-center text-[12px] leading-relaxed text-ink-lo">
        {cannotConnect ? null : <>You&apos;ll be taken to WHOOP to approve access. </>}
        <Link
          href="/privacy"
          className="underline decoration-ink-lo/40 underline-offset-2"
        >
          What we store
        </Link>
        .
      </p>
    </main>
  );
}
