import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { buildLiveDay } from "@/lib/live/build-day";
import { DayProposalView } from "@/components/live/day-proposal";
import { LoggedAgainstTarget } from "@/components/live/logged-against-target";

export const metadata: Metadata = {
  title: "Live mode — HealthOS",
  description: "Today's plan, built from your real WHOOP recovery and sleep.",
};

/** Reads a live third-party API and per-user rows; never cache this. */
export const dynamic = "force-dynamic";

/**
 * Live mode — the only day view. The scripted /day replay it was once kept
 * separate from has been deleted, because a fixture-driven walkthrough sitting
 * beside real output is exactly the kind of thing someone mistakes for their
 * own data.
 */
export default async function LivePage() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) redirect("/sign-in?next=/live");

  const result = await buildLiveDay(session.user.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-green/15 font-mono text-[11px] font-bold text-accent-green"
          >
            OS
          </span>
          <span className="text-[15px] font-semibold tracking-tight">HealthOS</span>
        </Link>
        <nav className="flex items-center gap-4">
          <Link
            href="/chat"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo underline underline-offset-4 transition hover:text-accent-green"
          >
            Chat
          </Link>
          <Link
            href="/onboarding"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo underline underline-offset-4 transition hover:text-accent-green"
          >
            Setup
          </Link>
        </nav>
      </header>

      <div>
        <h1 className="text-pretty text-[28px] font-semibold leading-[1.15] tracking-tight text-ink-hi">
          Live mode
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-lo">
          {result.status === "OK"
            ? "Today's plan, proposed from your own data. Nothing is applied until you confirm it."
            : "Today's plan, once the engine has something real to plan from."}
        </p>
      </div>

      {result.status === "OK" ? (
        <>
          {/*
            Logged-versus-planned sits above the rail deliberately: it is the
            question someone opens this screen to answer, and the plan below is
            what they do about the answer.
          */}
          <LoggedAgainstTarget dayTarget={result.proposal.dayTarget} />
          <Link
            href="/log"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-base-700 bg-base-900 px-4 text-[14px] font-semibold text-ink-hi"
          >
            Log a meal
          </Link>
          <DayProposalView
            proposal={result.proposal}
            fromCache={result.fromCache}
            cachedDay={result.cachedDay}
          />
        </>
      ) : (
        <BlockedState result={result} />
      )}
    </main>
  );
}

/**
 * Each blocked state names the specific missing thing and the one action that
 * clears it. A generic "something went wrong" would be the §4.11 failure this
 * whole screen is built to avoid.
 */
function BlockedState({
  result,
}: {
  result: Exclude<Awaited<ReturnType<typeof buildLiveDay>>, { status: "OK" }>;
}) {
  const states = {
    NO_WHOOP_APP: {
      heading: "WHOOP app not configured",
      body: "WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET are not set on this deployment, so no account can be connected yet. Add them from your WHOOP developer app.",
      href: null,
      cta: null,
    },
    NOT_CONNECTED: {
      heading: "No wearable connected",
      body: "Live mode reads last night's sleep and this morning's recovery from WHOOP. Without it there is no measurement to plan from, and a plan built on assumptions would be guesswork wearing a lab coat.",
      href: "/connect/whoop",
      cta: "Connect WHOOP",
    },
    NO_GOAL: {
      heading: "No goal contract yet",
      body: "The engine can read your recovery, but not what you want it to optimise for. Set a goal and today's plan becomes answerable.",
      href: "/onboarding/goal",
      cta: "Set your goal",
    },
    WHOOP_ERROR: {
      heading: "WHOOP could not be reached",
      body:
        "status" in result && result.status === "WHOOP_ERROR"
          ? `${result.message} There is also no stored reading to fall back on, so nothing is shown rather than something invented.`
          : "",
      href: "/connect/whoop",
      cta: "Check connection",
    },
  } as const;

  const state = states[result.status];

  return (
    <section className="rounded-2xl border border-base-700 bg-base-900 p-5">
      <h2 className="text-[17px] font-semibold tracking-tight text-ink-hi">
        {state.heading}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-lo">{state.body}</p>
      {state.href ? (
        <Link
          href={state.href}
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-accent-green px-4 text-[14px] font-semibold text-base-950"
        >
          {state.cta}
        </Link>
      ) : null}
    </section>
  );
}
