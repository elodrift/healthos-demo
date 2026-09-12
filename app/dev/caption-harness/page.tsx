/**
 * Test-only mount point for the caption suite. Never reachable in production.
 *
 * The guard is `notFound()` on `NODE_ENV === "production"` rather than a comment
 * asking people not to visit it. This route renders components with fixture
 * numbers in them, and a fixture number on a real deployment is precisely the
 * thing this codebase treats as unforgivable — the deleted scripted demo is in
 * CLAUDE.md §4 for exactly that reason.
 *
 * It resolves no session and touches no database, so it exposes nothing; the
 * production 404 is about never showing invented food numbers to a real user.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CaptionHarness } from "@/components/dev/caption-harness";
import { LABEL_FIXTURES, RECOGNITION_FIXTURES } from "@/tests/captions/payloads";

export const metadata: Metadata = {
  title: "Caption harness (dev)",
  robots: { index: false, follow: false },
};

// Removed for cacheComponents compatibility

function pickRecognition(v: string | undefined) {
  return v && v in RECOGNITION_FIXTURES ? (v as keyof typeof RECOGNITION_FIXTURES) : null;
}

function pickLabel(v: string | undefined) {
  return v && v in LABEL_FIXTURES ? (v as keyof typeof LABEL_FIXTURES) : null;
}

export default function CaptionHarnessPage({
  searchParams,
}: {
  searchParams?: { fixture?: string; shot?: string; label?: string };
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const shotRaw = searchParams?.shot;
  const shot = shotRaw === undefined || shotRaw === "" ? null : Number(shotRaw);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-lo">
        Caption harness — fixtures only
      </h1>
      <CaptionHarness
        fixture={pickRecognition(searchParams?.fixture)}
        shotOffsetMinutes={shot !== null && Number.isFinite(shot) ? shot : null}
        label={pickLabel(searchParams?.label)}
      />
    </main>
  );
}
