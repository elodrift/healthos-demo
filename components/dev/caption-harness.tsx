"use client";

/**
 * Mounts the real confirm and barcode components against fixture payloads.
 *
 * Why a harness rather than driving `/log` end to end: `/log` resolves a session,
 * so a browser test of it needs a database and a signed-up account. That makes the
 * suite depend on Neon being reachable to tell you whether a *sentence* is right,
 * and CI runs offline tests only. The components under test are the real ones and
 * the payloads are the real shapes, so what is skipped is the transport, not the
 * behaviour being asserted.
 *
 * The one thing this cannot cover is the wiring in `LogPanel` between the upload
 * response and `MealConfirm`'s props. That is a genuine seam this suite does not
 * reach, and it is stated here rather than left for someone to assume otherwise.
 */

import { useEffect, useState } from "react";

import { BarcodeEntry } from "@/components/photo/barcode-entry";
import { MealConfirm } from "@/components/photo/meal-confirm";
import {
  LABEL_FIXTURES,
  RECOGNITION_FIXTURES,
  type LabelFixtureName,
  type RecognitionFixtureName,
} from "@/tests/captions/payloads";

/** Naive wall clock in the browser's own zone — the format `capturedAt` expects. */
function wallClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CaptionHarness({
  fixture,
  shotOffsetMinutes,
  label,
}: {
  fixture: RecognitionFixtureName | null;
  /** Minutes from "now" to place the photo's EXIF time. Absent means no EXIF at all. */
  shotOffsetMinutes: number | null;
  label: LabelFixtureName | null;
}) {
  /*
    Everything time-dependent renders after mount, on purpose.

    `describeTime` reads `new Date()` during render. Server-rendering it would bake
    in the *server's* clock, then hydrate against the browser's — and Playwright's
    fixed clock only exists in the browser. The assertions would then be checking a
    sentence built from an uncontrolled time, which is the sort of test that passes
    for the wrong reason and fails at midnight.
  */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <p data-testid="harness-pending" className="text-[12px] text-ink-lo">
        mounting
      </p>
    );
  }

  const capturedAt =
    shotOffsetMinutes === null ? null : wallClock(new Date(Date.now() + shotOffsetMinutes * 60_000));

  return (
    <div data-testid="harness-ready" className="flex flex-col gap-4">
      {fixture ? (
        <section data-testid="confirm-under-test">
          <MealConfirm
            recognition={RECOGNITION_FIXTURES[fixture]}
            capturedAt={capturedAt}
            photoPathname="harness/fixture.jpg"
            onLogged={() => undefined}
          />
        </section>
      ) : null}

      {label ? (
        <section data-testid="barcode-under-test" data-label-fixture={label}>
          <BarcodeEntry onLogged={() => undefined} />
        </section>
      ) : null}
    </div>
  );
}
