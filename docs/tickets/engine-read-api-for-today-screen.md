# Engine read API — consumer contract for the Today screen

**For:** the engine repo (Python, holds every clinical rule).
**From:** the consumer side — `/live` in this repo (`healthos-demo`), which is
the real Today screen. `app/today/page.tsx` is a throwaway fixture and is not
in scope.
**Status:** consumer requirements, grilled and ruled by the founder
2026-08-20. Not code — this is the contract the engine needs to satisfy; the
engine side chooses its own implementation, including the open items below.
**Ground truth this was checked against:** `PRODUCT_DNA.md`, `CONTEXT.md`,
`lib/live/build-day.ts` (`LiveDayResult`), `lib/food/recognize.ts`
(`RecognitionResult`), `lib/provenance/naked-numbers.ts`,
`tests/captions/captions.spec.ts`, ADR-023, Decision 10.

## Why this exists

`/live` currently computes targets and plan content locally in
`lib/planner/propose-day.ts` — a pure TypeScript function. That violates
ADR-023 ("no clinical rule in TypeScript, ever") today. This ticket is the
read contract that lets `/live` stop doing that.

**Retention consequence (named explicitly so it isn't lost in translation):**
the "bar-2" retention trigger is defined as *the day the Today screen renders
real engine output*. Because `/live` is the real surface, the trigger
attaches to `/live` going live against this API — not to shipping the API in
isolation, and not to `app/today/page.tsx`.

## Migration shape — sequencing, not a rewrite

**Ship the API first. `/live` migrates behind it.** This is explicitly *not*
a big-bang rewrite of `propose-day.ts` timed to land simultaneously with the
API. The engine side can build and ship this contract on its own schedule;
the consumer-side cutover is a separate, later piece of work gated on the API
existing and being stable, not the other way around.

## The three reads, and why they're one endpoint

"What to eat now," "day status," and "logged-vs-target" are **one composite
endpoint**, returning all three sections under **one top-level discriminated
status union** — matching the existing idiom in this repo
(`LiveDayResult`, `RecognitionResult`): every outcome is named, nothing is
inferred from absence.

**But the three sections do not share a failure domain**, and the contract
must not pretend they do:

- **Logged-so-far** reads the ledger — local, cheap, almost always available.
- **What-to-eat-now** needs the planner plus wearable signals — many more
  ways to fail.

Losing "what you already ate today" to a failure of "what to eat next" is a
dead-screen problem this product cannot afford. So: **the top-level status
union is about the PLAN only.** Every variant of it — including every
degraded variant — must still carry today's logged totals when the ledger is
readable. The ledger section is either current, or explicitly and visibly
marked absent; it is never silently dropped because the plan failed.

## Status union (illustrative shape, not binding syntax)

```
TodayRead =
  | { status: "OK", plan: Plan, ledger: Ledger }
  | { status: "STALE", plan: Plan, computedAt: timestamp, ledger: Ledger | Absent }
  | { status: "WRONG_DAY", ledger: Ledger | Absent }        // see Day boundary, below
  | { status: "UNREACHABLE", ledger: Ledger | Absent }
  | { status: "NO_PLAN_YET", ledger: Ledger | Absent }
  | { status: "DEGRADED", reason: string, ledger: Ledger | Absent }

Ledger = { loggedTotals: NumberWithProvenance[], asOf: timestamp }
Absent = { reason: string }  // ledger read itself failed; say so, don't blank it
```

Exact variant names/count are the engine side's call — the binding
requirements are: (a) every case is named, none inferred from a missing
field: (b) `ledger` is present-or-explicitly-absent on every variant, never
just missing.

## Day boundary — profile-local, not client-local, not server-write-clock

Per **Decision 10**: day and session derive from `occurred_at`, never the
write clock. For this API: the day a plan belongs to is keyed to the
**user's profile timezone**, not the requesting client's current local day.
A travelling device must not silently invalidate a correct plan by asserting
its own day, and the client must not assert a day at all — the profile's
timezone is authoritative.

A plan whose profile-local day doesn't match the current profile-local day is
**`WRONG_DAY`** — its own status, never folded into `STALE` or
`UNREACHABLE`. Yesterday's "what to eat now" is not stale-but-usable; it's a
plan for a day that no longer exists. Cite Decision 10 in the engine-side
implementation so the reasoning travels with the code, not just this ticket.

## Captions — engine-authored, structurally accompanied

The engine emits **both**, on every plan-bearing number:

1. The **authoritative caption** — the literal rendered sentence. Verbatim,
   testable on its own.
2. The **structured claims** alongside it, for layout and for the provenance
   guard (see below).

This repo may compose *presentation* from the structured claims — badges,
ordering, visual emphasis — but **never composes a sentence that asserts
anything clinical.** A sentence assembled in TypeScript is one step from
TypeScript deciding what's true, which is the thing ADR-023 exists to
prevent. This binds captions the same way ADR-023 already binds numeric
rules.

**One narrow, explicit exception:** elapsed-time-since-computed. The engine
cannot know the client's render-time "now" when it authors a caption, and
"as of 12 minutes ago" is arithmetic on a timestamp, not a claim about food
or a body. So:

- The engine returns a raw `computedAt` timestamp.
- The client composes a freshness wrapper **around** the engine's caption —
  never inside it, never rewriting it. The engine's sentence stays verbatim
  and separately assertable, or the caption-testing property below breaks.

### Why this is stronger than what exists today, not weaker

`tests/captions/captions.spec.ts` already asserts the *rendered sentence*,
never the component's copy source, via a harness that imports no copy. Under
this contract, the sentence's source of truth moves from a TS copy layer to
the engine's fixture response — the fixture response **becomes the contract
under test**. Same enforcement mechanism, now checking the actual boundary
instead of a TS approximation of it.

## Provenance — polymorphic by section, not one universal shape

Two different vocabularies, not one field forced to mean two things:

**Logged / parsed numbers** carry:

```
provenance: { lane: "DETERMINISTIC" | "LLM", confidence: <engine's own scale>, portionBasis: PortionBasis }
PortionBasis = "MEASURED" | "COUNTED" | "DEFAULT" | "STATED_MACROS" | "MODEL_ESTIMATE"
```

`lane` is the engine's existing `ParseLane` (`domain.py:507`) — exactly two
values, naming which pipeline produced a *parse*. It does not apply to
anything that wasn't parsed.

**Planner-computed suggestions** ("what to eat now," nothing parsed, nothing
eaten yet) carry a **different provenance vocabulary** — not
`{ lane, confidence, portionBasis }`, because nothing was parsed and forcing
`lane` to mean "engine default policy" for a suggestion collapses two
meanings into one field. This is the same shape of bug the consumer side
already avoids by keeping this repo's barcode-only `portionBasis`
(`MANUFACTURER | UNKNOWN`) separate from the engine's five-value
`PortionBasis` above — same word, two enums, deliberately not unified.

**Open item, owned by the engine side — do not resolve from the consumer
side:** what a planner suggestion's provenance actually contains. The
consumer-side finding, arrived at independently twice in this grill (once as
"history-vs-seed," once as "lane doesn't apply to suggestions"), is that a
plan-sized portion is at minimum distinguishable along an axis like *template
default* vs. *derived from the user's own logged history* vs.
*WHOOP-adjusted* — but the actual vocabulary, and whether it's a strict enum
or something richer, is the engine's call.

**Standing rule #5 still applies without exception**: every number in either
section ships with its provenance sibling. It's just not always the same
sibling.

## Enforcement — both layers, not either/or

1. **Schema-required.** Provenance fields are required, not optional, on
   every numeric field the engine's response schema defines. A bare number
   is a parse/type failure at the fetch boundary — loud, at the network edge,
   not a runtime judgment call.
2. **Runtime guard**, mirroring `lib/provenance/naked-numbers.ts` on this
   side and the equivalent guard already ruled on the bot side today: catches
   technically-valid-but-empty provenance (e.g. `basis: null`) that a type
   system can't see.

A card that can't attribute a number renders **caption-only** — no number
beats an unattributed one. This is the same principle `recognize.ts`'s
`unavailable` variant already encodes on the vision-estimate path.

## Read semantics — fast, synchronous, no polling contract

This is a read against state the engine has **already decided** — a database
read, not a trigger for new inference. No `PENDING` variant, no poll-again
contract. If a future need genuinely requires new inference at request time
(vision-model-style latency), that is a **separate endpoint with its own
contract** — not a mode flag on this one.

## Versioning — how the consumer side learns the contract changed

- **`schemaVersion`** in every response, checked at this repo's parse layer.
  A mismatch fails loudly rather than silently rendering against a stale
  assumption.
- **A checked-in fixture**, captured from a real engine response, that
  `tests/captions/captions.spec.ts`-equivalent harness runs against. A silent
  engine-side wording or shape change either bumps `schemaVersion` (loud,
  deliberate) or breaks the harness test (loud, accidental) — never a silent
  drift.
- **Sync is manual for now.** There is one person operating both repos;
  `schemaVersion` is what makes manual safe. **Dependency to name, not
  forget:** an automated CI hook for this attaches when **Decision 5's merge
  gate** is executed in the bot repo. Pick this up then — it is out of scope
  for this ticket, but the ticket that implements Decision 5's gate should
  link back here.

## Visual rendering constraint (for the consumer side, stated here so the engine side knows what it's designing into)

`accent-red` is reserved exclusively for the medical never-suspends card
(CLAUDE.md §3). All three provenance claims — lane, confidence, portionBasis
— render as **neutral, monochrome, text-only.** No warning-color scale (no
amber/yellow tiers for low confidence). A warm-color scale on confidence
trains the user's eye to react to color before reading the claim, which is
the opposite of what an honest-uncertainty product is for. This has no
bearing on the API shape but constrains what the engine should assume happens
to `confidence` visually downstream — it will never become a color signal.

## Explicitly out of scope for this ticket

- Rewriting or deleting `propose-day.ts` (separate, later, gated migration —
  see "Migration shape" above).
- Defining planner-suggestion provenance vocabulary (open item, engine side).
- The CI sync mechanism for `schemaVersion`/fixture drift (attaches at
  Decision 5's merge gate).
- `guidanceMode` / DNA §4 Block 4 scenario exposure (cooking-myself / eat-out
  / food-ordering / food-logging) — confirmed **not** what "lane" means;
  if this is ever exposed via this API it needs its own name and its own
  design pass, not a reuse of `lane`.
- Any `PENDING`/inference-latency contract (separate endpoint if ever
  needed).

## Acceptance criteria

- [ ] One composite endpoint returns the full `TodayRead` union; every
      variant is named, none inferred from a missing field.
- [ ] Every variant, including every degraded one, carries `ledger` as
      current-or-explicitly-absent — never silently missing.
- [ ] `WRONG_DAY` and `STALE` are distinct, independently reachable statuses.
- [ ] Day-boundary keying uses profile timezone; a client-local-day override
      is not accepted as an input.
- [ ] Every logged/parsed number ships `{ lane, confidence, portionBasis }`;
      every planner-suggestion number ships its (engine-defined) provenance
      sibling — no number ships without one, and provenance is required in
      the schema, not optional.
- [ ] Every plan-bearing response includes an engine-authored caption
      sentence, verbatim, separately assertable from any client-side
      wrapper text.
- [ ] `computedAt` is present on any response that could be shown as stale.
- [ ] `schemaVersion` is present on every response.
- [ ] A fixture response is checked in and covers at minimum: `OK`,
      `STALE`, `WRONG_DAY`, `UNREACHABLE`, and a caption-bearing suggestion
      with its provenance sibling.
