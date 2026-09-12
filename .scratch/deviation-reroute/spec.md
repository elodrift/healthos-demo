# Spec: Deviation → Reroute (Meals only)

Status: ready-for-agent

First vertical slice of the HealthOS engine. Establishes `derivePlan` as the single
seam, the injected clock, the append-only Ledger, and the Reroute arithmetic.

## Problem Statement

The Athlete starts the day with a Plan and then reality happens: lunch is a burger with
a client, not the prescribed Meal. Every tracker the Athlete already owns responds to
this by recording it and leaving the arithmetic to them — they are handed a number they
went over and left to work out, unaided and mid-afternoon, what the rest of the day
should now look like. That calculation is exactly the work the Athlete is trying to
offload, and it is the work that gets skipped, which is why a day that goes off-plan at
13:00 is a day written off by 18:00.

Compounding it, the Athlete's constraints are not one number. A Fat Loss Macro Timeline
sets Protein, Carbohydrate and Fat for the day; High Cholesterol caps saturated fat;
High Uric Acid caps the purine and fructose allowance. Re-planning an afternoon by hand
against four or five simultaneous constraints, from a closed set of Meals, is not
something anyone does reliably while working.

## Solution

The Athlete opens HealthOS and sees today's Plan: four Meal Directives placed across the
day, each one prescribed in the imperative. Under each is a single tap — Confirm when it
happened as prescribed, Off-Track when it did not.

When the Athlete logs an off-plan lunch, the afternoon rewrites itself. The remaining
Directives are re-derived against what is actually left of the day's Targets, drawing
only on the Meals in the Profile, respecting every Biomarker Cap. The Athlete is not
shown a warning, a percentage, or a red bar; they are shown the new afternoon. The
destination has not changed, the route has.

Nothing about the recalculation is presented as a correction or a penalty. A Deviation
is an input.

## User Stories

1. As an Athlete, I want to see today's Plan as an ordered list of Meal Directives, so that I know what to eat and when without deciding anything.
2. As an Athlete, I want each Directive stated in the imperative, so that I am told what to do rather than asked to choose.
3. As an Athlete, I want to see the time each Directive is placed at, so that I can fit eating around the shape of my day.
4. As an Athlete, I want to Confirm a Directive with one tap, so that staying on plan costs me nothing.
5. As an Athlete, I want a Confirmation to be the default and cheapest path, so that the system does not tax me for compliance.
6. As an Athlete, I want to log a Deviation when I ate something other than what was prescribed, so that the rest of the day can account for it.
7. As an Athlete, I want to record what I actually ate when I deviate, so that the Reroute works from real numbers rather than a guess.
8. As an Athlete, I want the remaining Directives to change immediately after I log a Deviation, so that I never hold the recalculation in my head.
9. As an Athlete, I want only the Directives still ahead of me to be rerouted, so that the morning I already lived is left alone.
10. As an Athlete, I want my Reroute to draw only on the Meals in my Profile, so that I am never prescribed something I cannot or will not eat.
11. As an Athlete, I want to see what remains of today's Targets, so that I understand the budget the afternoon is working against.
12. As an Athlete, I want Headroom to account for both Confirmations and Deviations, so that the number reflects everything that has actually happened.
13. As an Athlete with a Fat Loss objective, I want my daily Protein, Carbohydrate and Fat Targets derived from that objective, so that I do not set macro numbers by hand.
14. As an Athlete, I want the day's Macro Targets split across my Meal Slots, so that each Directive carries its share rather than the whole day's total.
15. As an Athlete with High Cholesterol, I want saturated fat capped for the day, so that the Plan serves the biomarker I am actually trying to move.
16. As an Athlete with High Uric Acid, I want my purine and fructose allowance capped, so that Meals high in seafood or fructose are kept out of the day.
17. As an Athlete, I want a Cap to constrain the Reroute as hard as the Macro Targets do, so that recovering my macros never costs me my biomarkers.
18. As an Athlete, I want a Deviation that consumed most of a Cap to shrink what the afternoon may draw on, so that the limit holds across the whole day rather than per Meal.
19. As an Athlete, I want to be given the closest achievable afternoon when no combination of Meals can fully recover the day, so that I am still told what to do.
20. As an Athlete, I want to be told plainly when the day cannot land on its Targets, so that I am not misled into believing a rescue happened.
21. As an Athlete, I want Reroute messaging to stay free of blame, so that logging honestly never feels like a confession.
22. As an Athlete, I want to log several Deviations in one day, so that a day that goes wrong twice is still planned.
23. As an Athlete, I want each Reroute to work from the whole Ledger rather than the last event, so that earlier Deviations are not forgotten.
24. As an Athlete, I want my Confirmations and Deviations preserved across a restart, so that closing the app does not erase the day.
25. As an Athlete, I want to see the Glycaemic Load accumulated so far today, so that I have visibility of it even while it does not yet constrain the Plan.
26. As an Athlete, I want the Plan to show which Directives I already Confirmed and which I deviated from, so that the day reads as a record as well as an instruction.
27. As an Athlete, I want a Directive whose time has passed but which I never actioned to be distinguishable from one I confirmed, so that the Plan does not overstate what I did.
28. As an Athlete, I want to open the app at any hour and see a Plan appropriate to that hour, so that the day is always current.
29. As an Athlete, I want the same Ledger to always produce the same Plan at the same time, so that the system is predictable and I can trust it.
30. As a developer, I want the Plan derived by a pure function from Profile, Ledger and clock, so that any moment of any day is reproducible as a plain unit test.
31. As a developer, I want the current time injected rather than read ambiently, so that "the afternoon after a 13:00 Deviation" is testable without mocking time.
32. As a developer, I want the Ledger to be append-only, so that what was originally prescribed is never overwritten by what replaced it.
33. As a developer, I want the store to be a narrow interface over an array, so that swapping the local file for a database later is close to mechanical.

## Implementation Decisions

### The seam

- **`derivePlan(profile, ledger, now) -> Plan` is the single public interface of the
  engine**, per ADR-0002. Confirmed with the developer as the one and only test seam for
  this slice.
- **Reroute is not a function.** There is no `reroute()` to call. A Reroute is what
  `derivePlan` returns once a new Deviation is present in the Ledger. Nothing in the
  engine mutates a Plan.
- **Headroom is part of the returned Plan**, not a separately exported calculation. The
  Athlete sees it on screen, so it belongs to the Plan's public shape.
- **The Swap chooser and the Biomarker Cap rules stay internal.** Both are pure and both
  are tempting to test directly; both are observed only through `derivePlan` so that the
  tests survive a refactor of either.
- **No module below the entry point reads the clock.** `now` is threaded in.

### Profile

- The Profile is a static fixture for this slice — a typed object, loaded from one place,
  not authored through any UI.
- The Profile holds: the Macro Timeline objective, the Athlete's Biomarker findings, the
  Meal Slot definitions, and the closed set of Meals.
- Each Meal in the Profile carries its full pre-costed nutritional footprint: Macros in
  grams, saturated fat in grams, a purine load, a fructose load, and a Glycaemic Load
  value. The engine never computes these from ingredients; it reads them.

### Macro Target derivation

- The **Macro Timeline objective** yields the day's Macro Targets. Fat Loss = 2,000 kcal
  → 180g Protein, 170g Carbohydrate, 65g Fat. Encoded as a lookup from objective to
  Targets, not as a formula, so that adding an objective is data rather than arithmetic.
- The day's Macro Targets are **split across the Meal Slots** — four structural blocks
  across the day for the Fat Loss objective. The split is a property of the Slot
  definitions in the Profile, so an uneven day (a large post-training block) is
  expressible without changing the engine.

### Biomarker Caps

- A Biomarker finding in the Profile derives a **Cap**: a daily ceiling the whole day
  must stay under, distinct from a Macro Target the day is trying to land on.
- **High Cholesterol → saturated fat capped at 15g per day.**
- **High Uric Acid → a capped daily purine and fructose allowance**, which in practice
  excludes or limits Meals whose footprint is driven by seafood or high-fructose
  components.
- Caps are consumed by the whole day, not per Meal or per Slot: a Deviation that spent
  12g of a 15g saturated fat Cap leaves the entire remaining day 3g.
- **Caps and Macro Targets are not equally negotiable.** A Cap is a hard constraint on
  Swap selection; a Macro Target is the thing being optimised toward. A Reroute never
  breaks a Cap in order to recover Macros.

### Headroom

- Headroom is what remains of the day's Macro Targets and Caps after every row in the
  Ledger so far.
- A **Confirmation** consumes the footprint of the Meal that was prescribed. A
  **Deviation** consumes the footprint of what was actually eaten.
- Headroom may go negative on any axis. A negative Macro Headroom is a real state the
  Reroute must plan against, not an error.

### Deviation payload

- A Deviation carries an explicit nutritional footprint of what was eaten, in the same
  shape a Meal carries. It is not required to reference a Meal from the Profile's closed
  set — the whole point of a Deviation is that the Athlete ate something off-menu.
- Where those numbers come from at the UI layer (a picker over known Meals, or manual
  entry) is a presentation concern and does not reach the engine.
- **The closed Meal set constrains what HealthOS may prescribe, never what the Athlete
  may report.**

### Reroute arithmetic

- On each derivation: compute Headroom from the Ledger, identify the Slots still ahead of
  `now`, and select a Meal from the closed set for each, such that the selected Meals fit
  within Headroom and break no Cap.
- Slots already passed are not re-planned. Their Directives are returned in the Plan
  carrying their outcome — confirmed, deviated, or unactioned — so the Plan reads as a
  record of the day as well as an instruction for the rest of it.
- **Infeasibility is a first-class outcome, not an exception.** When no combination of
  Meals can land the day on its Targets, the engine returns the closest achievable
  afternoon and marks the Plan as unable to reach Targets. The prescriptive stance of
  ADR-0001 means the Athlete is always told what to do next; the honest stance means they
  are never told a rescue happened when it did not.
- A Cap that has already been exceeded by a Deviation constrains the remainder to Meals
  that add nothing further on that axis, rather than producing no Plan at all.

### The Ledger and its store

- The Ledger is an append-only array of rows. Each row records the Directive it responds
  to, whether it is a Confirmation or a Deviation, its timestamp, and — for a Deviation —
  the footprint of what was eaten.
- For this MVP the Ledger persists as a local `ledger.json`, read at the entry point and
  handed to `derivePlan` as a plain array. The engine has no knowledge of the file.
- The store exposes only append and read. Nothing updates or deletes.
- **A new ADR is required** recording this store choice and its intended replacement
  path, per the pattern of the existing two.

### Surface

- One page. Today's Plan in time order, Headroom visible, and per-Directive Confirm and
  Off-Track actions.
- Copy is imperative throughout, per ADR-0001, and carries no blame on the Deviation
  path.
- Each action appends one row and re-derives. No optimistic mutation of a Plan anywhere
  in the client.

## Testing Decisions

- **A good test here asserts on a returned Plan, not on how it was produced.** Every test
  builds a Profile fixture and a Ledger array, calls `derivePlan` with an explicit `now`,
  and asserts on the Directives and Headroom that come back. No test reaches into the
  Swap chooser, the Cap rules, or the Slot splitter; all three must be refactorable
  without touching a test file.
- **Expected values come from worked examples, never recomputed the way the code
  computes them.** A test asserting Headroom after a Deviation states the grams it
  expects as literals derived by hand from the fixture, so the test can disagree with the
  implementation.
- **Vertical slices, one at a time.** One test, one minimal implementation, repeat. No
  writing the suite up front — each cycle responds to what the last one taught.
- **Module under test:** the engine, exclusively, through `derivePlan`. The Ledger store
  and the page are not tested in this slice; they are thin adapters either side of the
  seam and carry no arithmetic.
- **Test names use glossary vocabulary** — Directive, Deviation, Reroute, Headroom, Cap,
  Swap — so the suite reads as a specification of the domain.
- **Prior art: none.** This is the first test in the repo. The suite established here is
  the prior art every later slice follows. Vitest 5 is installed and green; the
  placeholder test added during setup is deleted by the first red cycle.

### Cycle order

Roughly, each one a tracer bullet rather than a fixed plan:

1. A Plan derives from a Profile and an empty Ledger — Slots become Directives in time order.
2. Macro Targets derive from the Macro Timeline objective and split across the Slots.
3. A Confirmation consumes its Meal's footprint from Headroom.
4. A Deviation consumes the footprint of what was actually eaten.
5. Directives ahead of `now` reroute against Headroom; passed Slots are untouched.
6. A Swap is drawn only from the closed Meal set.
7. A saturated fat Cap constrains selection independently of the Macro Targets.
8. A purine/fructose allowance Cap does the same.
9. Multiple Deviations in one day compose; the whole Ledger is the input.
10. An unrecoverable day returns the closest achievable afternoon, marked as such.

## Out of Scope

- **Training Directives, hydration cues, and Commitments.** Meals only. Commitments exist
  in the glossary but do not constrain Slot placement in this slice; Slot times are fixed
  by the Profile.
- **Glycaemic Load as a constraint.** Accumulated and displayed, but it does not
  influence Swap selection. It becomes a constraint in a later slice.
- **Onboarding.** The Profile is a fixture; there is no UI for authoring Goals,
  Biomarkers, Targets, Meals, or Slots.
- **Multi-Athlete anything.** One Athlete, no accounts, no auth, no database.
- **History.** Only today. No trends, no streaks, no reviewing a past day — and note that
  ADR-0002 makes past Plans unstable by design, so any historical view needs snapshotting
  decided first.
- **Editing or deleting Ledger rows.** Append only. A mistaken log stays logged.
- **Notifications, reminders, timers.** Nothing pushes; the Athlete opens the app.
- **Biomarker ingestion.** Findings are stated in the Profile, not parsed from a blood
  panel.
- **Meal preparation detail.** A Meal is a pre-costed unit with a footprint; recipes,
  ingredients, and shopping are not modelled.

## Further Notes

### Vocabulary (settled)

The four terms this spec needed are now in `CONTEXT.md`: **Macro Timeline** (the mapping
from a Goal to the day's Macro Targets), **Slot**, **Cap**, and **Footprint**. Two
existing entries changed with them:

- **Target** narrowed to Macros only. A Biomarker no longer carries a Target; it derives
  a Cap. This is what makes "Caps outrank Targets" a statement about two kinds of thing
  rather than a priority within one.
- **Deviation** now states explicitly that it carries a Footprint and is not confined to
  the Profile's Meals.

**Closest Achievable** was added as the name for the infeasible-day Plan state, so the UI
copy and the engine share one word for it.

### ADRs (written)

- **ADR-0003** — Biomarker Caps are derived in the engine, not stated in the Profile.
  Records the rejected alternative, ties the reopening condition to ADR-0001, and flags
  that the two thresholds are working assumptions without clinical provenance.
- **ADR-0004** — the Ledger persists as an append-only local file.

### Sequencing

`derivePlan` and its tests come first and can be built end to end without touching the
surface. The page is wired only once the engine is green.

### Before writing any Next.js code

Per `AGENTS.md`, this repo runs a version of Next.js whose APIs and conventions differ
from training data. Read the relevant guide under `node_modules/next/dist/docs/` before
writing the page, the actions, or anything that touches the framework. The engine itself
is plain TypeScript and is unaffected.
