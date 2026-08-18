import { expect, test, type Page } from "@playwright/test";

import { LABEL_FIXTURES, RECOGNITION_FIXTURES } from "./payloads";

/**
 * The caption regression suite (issue #12).
 *
 * Standing rule 6: a caption is tested by asserting the rendered sentence, never
 * by reading the component. So every assertion here reads text out of the DOM, and
 * nothing imports the copy it is checking — if a sentence is deleted, these fail,
 * which is the entire point. Numbers are asserted only where the number *is* the
 * claim (the provenance a POST carries); the sentences are what get pinned.
 *
 * THE FIVE BUGS, AND WHERE THE LIST COMES FROM. Issue #12 has an empty body and my
 * record of the conversation that enumerated these was truncated, so this list is
 * reconstructed from evidence still in the repo — each case below cites the comment
 * or rule that documents it. If the real list differs, correct it here; the shape
 * of the suite does not change.
 *
 *  1. Upload time worn as eating time      — meal-confirm.tsx: "the meal took the
 *     *upload* time, so reviewing brunch photos at night logged everything at
 *     midnight with nothing on screen to reveal it".
 *  2. Backdated photo appears to file today — "A backdated meal will not appear in
 *     'today', so say so outright rather than let it save and seem to vanish."
 *  3. Untrustworthy EXIF used anyway       — "Same rejection the server applies, so
 *     the copy cannot promise a time the insert will not use."
 *  4. Failed estimator still shows numbers — CLAUDE.md §3, `recognize.ts` returns
 *     `unavailable`/`implausible` "instead of a number it cannot stand behind".
 *  5. Non-food photo yields an estimate    — CONTEXT.md: presenting an inferred
 *     number as a measured one is the one unforgivable bug.
 */

/*
  A fixed clock, mid-afternoon.

  `setFixedTime` rather than `clock.install()`: install fakes the timer queues too,
  and React's commit scheduling then stalls, so the harness would never mount. This
  pins `new Date()` — which is all `describeTime` reads — and leaves timers real.

  Mid-afternoon matters. A "two hours ago" offset from a late-evening or
  small-hours clock crosses midnight and silently becomes the *backdated* branch,
  so the same-day test would assert the wrong sentence and still pass some days.
*/
const FIXED_NOW = new Date("2026-08-18T14:30:00");

const MINUTE = 1;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

async function openHarness(
  page: Page,
  params: { fixture?: string; shot?: number | null; label?: string },
) {
  await page.clock.setFixedTime(FIXED_NOW);
  const q = new URLSearchParams();
  if (params.fixture) q.set("fixture", params.fixture);
  if (params.shot !== undefined && params.shot !== null) q.set("shot", String(params.shot));
  if (params.label) q.set("label", params.label);
  await page.goto(`/dev/caption-harness?${q.toString()}`);
  await expect(page.getByTestId("harness-ready")).toBeVisible();
}

/** Everything the confirm card actually renders, as one string. */
async function confirmText(page: Page): Promise<string> {
  return ((await page.getByTestId("confirm-under-test").textContent()) ?? "").replace(/\s+/g, " ");
}

/**
 * Does the card *claim* an estimate exists?
 *
 * Read from the heading, not from a substring search of the whole card, because
 * two of the failure captions contain the word while denying it — "nothing was
 * estimated", "nothing was guessed". A naive `toContainText("estimate")` passes on
 * those for the opposite of the right reason, which is the trap this helper exists
 * to close.
 */
async function claimsAnEstimate(page: Page): Promise<boolean> {
  const heading = await page.getByTestId("confirm-under-test").getByRole("heading").textContent();
  return /estimate/i.test(heading ?? "");
}

const MACRO_LABELS = ["kcal", "protein g", "carbs g", "fat g"] as const;

async function macroValues(page: Page): Promise<string[]> {
  const scope = page.getByTestId("confirm-under-test");
  return Promise.all(
    MACRO_LABELS.map((l) => scope.getByLabel(l, { exact: true }).inputValue()),
  );
}

// ---------------------------------------------------------------------------
// Bug 1 — the upload clock wearing the eating clock's clothes.
// ---------------------------------------------------------------------------

test("bug 1: a photo with no capture time says so, and names the upload clock", async ({ page }) => {
  await openHarness(page, { fixture: "recognized", shot: null });
  const text = await confirmText(page);

  expect(text).toContain("this photo carried no capture time");
  expect(text).toContain("not necessarily when you ate");
  /*
   * The failure mode is the card sounding certain about a time it was never
   * given, which in this component reads "Taken at 1:15 PM, from the photo."
   *
   * Asserting on the bare phrase "from the photo" is what this test did first,
   * and it failed against correct output: the estimator's own uncertainty note
   * ("The broth's oil is hard to judge from the photo") contains that phrase
   * innocently. Two different sentences, one substring. The claim being
   * forbidden here is specifically a *sourced clock*, so match the clock.
   */
  expect(text).not.toMatch(/Taken (at|\d)[^.]*from the photo/);
});

// ---------------------------------------------------------------------------
// Bug 2 — a backdated meal that looks like it lands today.
// ---------------------------------------------------------------------------

test("bug 2: a photo from three days ago says it will not be logged today", async ({ page }) => {
  await openHarness(page, { fixture: "recognized", shot: -3 * DAY });
  const text = await confirmText(page);

  expect(text).toContain("not today");
  expect(text).toContain("from the photo");
  // "That is when this meal will be logged" belongs to the same-day branch only.
  expect(text).not.toContain("That is when this meal will be logged");
});

test("same-day capture states the photo's own clock as the logging time", async ({ page }) => {
  await openHarness(page, { fixture: "recognized", shot: -2 * HOUR });
  const text = await confirmText(page);

  expect(text).toContain("from the photo");
  expect(text).toContain("That is when this meal will be logged");
  expect(text).not.toContain("not today");
  expect(text).not.toContain("carried no capture time");
});

// ---------------------------------------------------------------------------
// Bug 3 — EXIF the server will reject, quoted to the user as fact.
// ---------------------------------------------------------------------------

for (const [name, shot] of [
  ["in the future", 1 * DAY],
  ["older than thirty days", -40 * DAY],
] as const) {
  test(`bug 3: a capture time ${name} is refused, and the card says upload time is used`, async ({
    page,
  }) => {
    await openHarness(page, { fixture: "recognized", shot });
    const text = await confirmText(page);

    expect(text).toContain("too far off to trust");
    expect(text).toContain("upload time is used instead");
    // It must not also promise the photo's clock, which the insert will not use.
    expect(text).not.toContain("That is when this meal will be logged");
  });
}

// ---------------------------------------------------------------------------
// Bugs 4 and 5 — a failed or inapplicable estimate still showing numbers.
// ---------------------------------------------------------------------------

test("bug 4: an unavailable estimator guesses nothing and prefills nothing", async ({ page }) => {
  await openHarness(page, { fixture: "unavailable", shot: -2 * HOUR });

  expect(await confirmText(page)).toContain("nothing was guessed");
  expect(await claimsAnEstimate(page)).toBe(false);
  // The bug is a blank-looking failure that quietly seeded the fields anyway.
  expect(await macroValues(page)).toEqual(["", "", "", ""]);
});

test("bug 4: an implausible reading is named as such and prefills nothing", async ({ page }) => {
  await openHarness(page, { fixture: "implausible", shot: -2 * HOUR });
  const text = await confirmText(page);

  expect(text).toContain(RECOGNITION_FIXTURES.implausible.reason);
  expect(text).toContain("Type what you think it was instead");
  expect(await claimsAnEstimate(page)).toBe(false);
  expect(await macroValues(page)).toEqual(["", "", "", ""]);
});

test("bug 5: a non-food photo estimates nothing and prefills nothing", async ({ page }) => {
  await openHarness(page, { fixture: "not-food", shot: -2 * HOUR });

  expect(await confirmText(page)).toContain("nothing was estimated");
  expect(await claimsAnEstimate(page)).toBe(false);
  expect(await macroValues(page)).toEqual(["", "", "", ""]);
});

/**
 * The biconditional, stated once over every payload.
 *
 * Each test above pins one sentence. This pins the relationship they all serve: a
 * card claims an estimate exactly when there is an estimate to claim. A future
 * payload variant that renders "Estimate — check it" over empty fields fails here
 * even if every sentence above still passes.
 */
test("a card claims an estimate exactly when the payload contains one", async ({ page }) => {
  for (const name of Object.keys(RECOGNITION_FIXTURES) as (keyof typeof RECOGNITION_FIXTURES)[]) {
    await openHarness(page, { fixture: name, shot: -2 * HOUR });

    const payloadHasEstimate = RECOGNITION_FIXTURES[name].kind === "recognized";
    expect(await claimsAnEstimate(page), `heading for "${name}"`).toBe(payloadHasEstimate);

    const filled = (await macroValues(page)).some((v) => v !== "");
    expect(filled, `prefilled fields for "${name}"`).toBe(payloadHasEstimate);
  }
});

// ---------------------------------------------------------------------------
// The barcode "I weighed this" gate, both branches.
// ---------------------------------------------------------------------------

/**
 * Stub the label lookup and capture what the log POST claims.
 *
 * Returns a getter for the body rather than asserting inside the handler, so a
 * failed assertion surfaces as a test failure and not as an unhandled rejection
 * inside a route callback.
 */
async function stubBarcode(page: Page, fixture: keyof typeof LABEL_FIXTURES) {
  await page.route("**/api/barcode**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(LABEL_FIXTURES[fixture]),
    }),
  );

  const posted: Record<string, unknown>[] = [];
  await page.route("**/api/meals", (route) => {
    posted.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return () => posted;
}

async function lookUp(page: Page, code: string) {
  const scope = page.getByTestId("barcode-under-test");
  await scope.getByLabel("Barcode digits").fill(code);
  await scope.getByRole("button", { name: "Look up" }).click();
  await expect(scope.getByLabel("How much did you eat")).toBeVisible();
  return scope;
}

test("barcode gate, unticked: an unweighed portion is logged as an estimate", async ({ page }) => {
  const posted = await stubBarcode(page, "with-serving");
  await openHarness(page, { label: "with-serving" });
  const scope = await lookUp(page, LABEL_FIXTURES["with-serving"].barcode);

  await scope.getByLabel("How much did you eat").fill("30");
  await scope.getByRole("button", { name: "Log this" }).click();

  await expect.poll(() => posted().length).toBe(1);
  expect(posted()[0]).toMatchObject({ weighed: false, confidence: "MEDIUM", source: "barcode" });
});

test("barcode gate, ticked: a weighed portion is the only way to claim HIGH", async ({ page }) => {
  const posted = await stubBarcode(page, "with-serving");
  await openHarness(page, { label: "with-serving" });
  const scope = await lookUp(page, LABEL_FIXTURES["with-serving"].barcode);

  await scope.getByLabel("How much did you eat").fill("30");
  await scope.getByLabel("I weighed this").check();
  await scope.getByRole("button", { name: "Log this" }).click();

  await expect.poll(() => posted().length).toBe(1);
  expect(posted()[0]).toMatchObject({ weighed: true, confidence: "HIGH", source: "barcode" });
});

/**
 * The laundering guard: a published serving is offered, never assumed.
 *
 * CONTEXT.md's `portionBasis` exists for this. The bug would be prefilling the
 * manufacturer's 15g so it gets accepted unread, at which point their typical
 * portion has become the user's measured intake without anyone deciding it.
 */
test("a published serving size is never prefilled into the portion field", async ({ page }) => {
  await stubBarcode(page, "with-serving");
  await openHarness(page, { label: "with-serving" });
  const scope = await lookUp(page, LABEL_FIXTURES["with-serving"].barcode);

  await expect(scope.getByLabel("How much did you eat")).toHaveValue("");
  await expect(scope).toContainText("That is their typical portion, not yours.");

  // Offered explicitly, as an action the user takes.
  await scope.getByRole("button", { name: /Use one serving/ }).click();
  await expect(scope.getByLabel("How much did you eat")).toHaveValue("15");
});

test("a packet with no published serving says there is no portion to suggest", async ({ page }) => {
  await stubBarcode(page, "no-serving");
  await openHarness(page, { label: "no-serving" });
  const scope = await lookUp(page, LABEL_FIXTURES["no-serving"].barcode);

  await expect(scope).toContainText("publishes no serving size");
  await expect(scope.getByLabel("How much did you eat")).toHaveValue("");
  await expect(scope.getByRole("button", { name: /Use one serving/ })).toHaveCount(0);
});
