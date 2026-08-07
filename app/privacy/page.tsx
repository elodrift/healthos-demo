import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — HealthOS",
  description:
    "What HealthOS collects, why, where it is stored, and how to disconnect your wearable or delete your data.",
};

/**
 * Public privacy policy.
 *
 * WHOOP presents this link inside the OAuth consent flow, so it must be
 * reachable without a session — no auth guard on this route.
 *
 * Content is written from the actual schema in lib/db/schema.ts and the
 * actual scopes requested in lib/whoop/client.ts. If either changes, this
 * page must change with it: a privacy policy that overstates or understates
 * what is collected is worse than none.
 */

const CONTACT = "patrick@innowave.cc";
const UPDATED = "August 7, 2026";

/** Exactly the scopes requested in lib/whoop/client.ts. */
const whoopScopes = [
  ["read:recovery", "Recovery score, heart-rate variability, resting heart rate"],
  ["read:sleep", "Sleep duration, sleep performance, time in bed and awake"],
  ["read:cycles", "Daily strain and energy expenditure"],
  ["read:workout", "Workout start, end, sport and intensity"],
  ["read:profile", "Your WHOOP user id, first name and email"],
  ["offline", "Permission to refresh access while you are not using the app"],
] as const;

const collected = [
  {
    label: "Account",
    body: "Your email address and a hashed password. Passwords are hashed by Better Auth and are never stored in readable form.",
  },
  {
    label: "Wearable data",
    body: "The WHOOP metrics listed below, once you explicitly connect WHOOP. Nothing is read from WHOOP before you authorise it, and nothing is read after you disconnect.",
  },
  {
    label: "Meals you log",
    body: "Descriptions, times, photos you choose to upload, and the estimated protein, carbohydrate, fat and energy derived from them.",
  },
  {
    label: "Baseline documents",
    body: "Any bloodwork, body-composition or scan files you upload yourself. These are optional; the app works without them.",
  },
  {
    label: "Your goal and constraints",
    body: "Your objective, target date, training schedule, food preferences and similar answers given during onboarding.",
  },
];

const notCollected = [
  "No advertising or tracking cookies, and no third-party analytics or advertising SDKs.",
  "No location data. Photo EXIF metadata, which can contain GPS coordinates, is stripped before a photo is stored.",
  "No sale of your data, and no sharing of it for advertising or profiling by anyone.",
];

export default function PrivacyPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pb-12 pt-8 lg:px-8">
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
        </header>

        <h1 className="mt-10 text-pretty text-[28px] font-semibold leading-[1.15] tracking-tight text-ink-hi sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
          Last updated {UPDATED}
        </p>

        <div
          role="note"
          className="mt-6 rounded-2xl border border-base-700 bg-base-850 px-4 py-4 shadow-card"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent-green">
            Prototype in active development
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-mid">
            HealthOS is an early-stage product being tested by its author. It is not a medical
            device and gives no medical advice. Do not use it to make decisions about medication,
            treatment or diagnosis — speak to a qualified clinician instead.
          </p>
        </div>

        <Section title="Who is responsible">
          <p>
            This app is operated by its author, who can be reached at{" "}
            <a
              href={`mailto:${CONTACT}`}
              className="text-accent-green underline decoration-accent-green/40 underline-offset-2"
            >
              {CONTACT}
            </a>
            . That address is the contact point for any question or request about your data.
          </p>
        </Section>

        <Section title="What is collected">
          <dl className="flex flex-col gap-4">
            {collected.map((item) => (
              <div key={item.label}>
                <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
                  {item.label}
                </dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-ink-mid">{item.body}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="What WHOOP data is read">
          <p>
            If you connect WHOOP, the app requests exactly these permissions and nothing more. Each
            one is requested because a specific feature needs it.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {whoopScopes.map(([scope, meaning]) => (
              <li key={scope} className="flex flex-col gap-1">
                <code className="w-fit rounded bg-base-850 px-2 py-0.5 font-mono text-[11px] text-accent-green">
                  {scope}
                </code>
                <span className="text-[14px] leading-relaxed text-ink-mid">{meaning}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4">
            The app only ever reads from WHOOP. It never writes to your WHOOP account and never
            modifies or deletes anything there.
          </p>
        </Section>

        <Section title="Why it is used">
          <p>
            Your data is used for one purpose: to produce and adjust your own nutrition and
            training plan, and to show you why each recommendation was made. Recovery and sleep
            shape the timing and size of what the app suggests; your logged meals are compared
            against those suggestions.
          </p>
          <p className="mt-3">
            It is not used to train machine-learning models for anyone else, and it is not used to
            build a profile of you for any purpose beyond your own plan.
          </p>
        </Section>

        <Section title="Where it is stored">
          <p>
            Account details, wearable metrics, plans and meal entries are stored in a Neon
            PostgreSQL database. Uploaded photos and documents are stored in Vercel Blob under
            private access, meaning they are not publicly listable. The app is hosted on Vercel.
            All three providers encrypt data at rest and in transit, and act as processors on the
            operator&apos;s behalf.
          </p>
          <p className="mt-3">
            Your WHOOP access and refresh tokens are stored server-side so that syncing can
            continue in the background. They are never exposed to the browser.
          </p>
        </Section>

        <Section title="What is never done">
          <ul className="flex flex-col gap-2.5">
            {notCollected.map((line) => (
              <li key={line} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-mid">
                <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-green" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Your controls">
          <p>
            You can disconnect WHOOP at any time from inside the app, which deletes the stored
            tokens and stops all further syncing. You can also revoke access directly from your
            WHOOP account settings, which has the same effect.
          </p>
          <p className="mt-3">
            You can ask for a copy of your data, correction of anything inaccurate, or deletion of
            your account and everything attached to it, by emailing{" "}
            <a
              href={`mailto:${CONTACT}`}
              className="text-accent-green underline decoration-accent-green/40 underline-offset-2"
            >
              {CONTACT}
            </a>
            . Deletion removes your account, wearable data, plans, meal entries and uploaded files.
            Depending on where you live, you may have these rights by law — including under the
            GDPR — and this policy does not limit them.
          </p>
        </Section>

        <Section title="How long it is kept">
          <p>
            Data is kept while your account exists, because the plan depends on history. Wearable
            data stops being collected the moment you disconnect. When you delete your account,
            your data is deleted with it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If what the app collects changes, this page changes at the same time, and the date at
            the top is updated. Material changes affecting data already collected will be notified
            to the email on your account.
          </p>
        </Section>

        <footer className="mt-12 border-t border-base-700 pt-5">
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-lo transition hover:text-accent-green"
          >
            Back to HealthOS
          </Link>
        </footer>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[17px] font-semibold tracking-tight text-ink-hi">{title}</h2>
      <div className="mt-2.5 text-[14px] leading-relaxed text-ink-mid">{children}</div>
    </section>
  );
}
