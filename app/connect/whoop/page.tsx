import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { wearableConnection } from "@/lib/db/schema";
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

      {credentialsMissing ? (
        <section className="mt-4 rounded-xl border border-base-700 bg-base-900 p-4">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
            Setup needed
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
            <code className="font-mono text-[12px] text-ink-hi">
              WHOOP_CLIENT_ID
            </code>{" "}
            and{" "}
            <code className="font-mono text-[12px] text-ink-hi">
              WHOOP_CLIENT_SECRET
            </code>{" "}
            are not set, so the button below is disabled. Add them from your
            WHOOP developer app, then reload.
          </p>
        </section>
      ) : null}

      <a
        href={credentialsMissing ? undefined : "/api/whoop/connect"}
        aria-disabled={credentialsMissing}
        className={
          "mt-5 flex min-h-[44px] w-full items-center justify-center rounded-lg px-4 text-[15px] font-semibold transition-opacity " +
          (credentialsMissing
            ? "pointer-events-none bg-base-700 text-ink-lo"
            : "bg-accent-green text-base-950")
        }
      >
        {conn ? "Reconnect WHOOP" : "Connect WHOOP"}
      </a>

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

      <p className="mt-3 text-center text-[12px] leading-relaxed text-ink-lo">
        You&apos;ll be taken to WHOOP to approve access.{" "}
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
