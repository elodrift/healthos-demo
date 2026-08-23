# CONTEXT — the language of this codebase

## The core idea
A number about food is a *claim*. Every claim carries how it is known.
Presenting an inferred number as a measured one is the one unforgivable bug.

## Vocabulary
- **MEASURED** — from a scale or a manufacturer's label.
- **ASSUMED / estimated** — inferred. Almost everything is this.
- **portionBasis (this repo's, barcode path only)** — how a *logged* portion
  size is known.
  - `MANUFACTURER`: the packet publishes a serving size.
  - `UNKNOWN`: nothing published; the user must supply grams. Never invent one.
  - Scoped to the barcode/logged-meal path only. Do **not** merge with the
    engine's `PortionBasis` below — same English word, deliberately different
    enum, deliberately not unified (2026-08-20 grill).
- **weighed** — the user put it on a scale. A barcode scan alone is NOT weighed.
- **estimated: false** — only when source is `barcode` AND `weighed` is true.
- **floor vs target** — different promises. Clearing a floor is a success;
  missing a target is not. `proteinKind` decides which verb the UI uses.
- **confidence (app-level)** — LOW / MEDIUM / HIGH, describing what the *user
  accepted*, measured post-confirm. Do not confuse with `provenance.confidence`
  below, which is the engine's own pre-confirm certainty — namespaced apart on
  purpose so one word doesn't carry two meanings (2026-08-20 grill).
- **controlLevel** — FULL / PARTIAL / MINIMAL / UNKNOWN.
- **timeBasis** — `photo-capture` or `upload`: which clock filed the meal.
- **local day** — a *logged* meal belongs to the user's local day, never the
  server's. See **profile-local day** below for the related but distinct
  concept governing which day a *live plan* belongs to.
- **§4.11** — the rule against presenting the app's guess as the user's intent.

## Engine-side vocabulary consumed by this repo (2026-08-20 grill)
- **lane** — the engine's `ParseLane` (engine `domain.py:507`): exactly two
  values, `DETERMINISTIC` | `LLM`, naming which pipeline produced a
  *parsed* number. Scoped strictly to parsed/logged numbers. A
  planner-computed suggestion has no parse and therefore no `lane` — do not
  widen this enum to cover "engine default policy" for a suggestion; that
  merges two meanings into one field, the same bug portionBasis avoids above.
- **provenance** — the namespaced object `{ lane, confidence, portionBasis }`
  the engine attaches to a parsed/logged number. One shape, matching the
  engine's own three-claim vocabulary exactly — this repo does not maintain a
  parallel field (e.g. no `engineConfidence`).
- **planner provenance** — the *different* provenance vocabulary a
  planner-computed suggestion (not yet eaten, nothing parsed) carries instead
  of `{ lane, confidence, portionBasis }`. **Not yet defined** — open item
  owned by the engine side (see the read-API ticket). Do not invent this
  vocabulary from the consumer side.
- **PortionBasis (engine, canonical for anything the engine emits)** —
  `MEASURED | COUNTED | DEFAULT | STATED_MACROS | MODEL_ESTIMATE`. Describes
  how a *parse* derived a portion, not how a *plan* sized one — the same gap
  `planner provenance` above exists to close.
- **profile-local day** — the day a live plan belongs to, keyed to the user's
  **profile timezone**, not the client device's current local day and not the
  server's write clock. Per Decision 10: day and session derive from
  `occurred_at`, never the write clock. A travelling device must not silently
  invalidate a correct plan by asserting its own day.
- **wrong day** — a plan whose profile-local day doesn't match the current
  profile-local day. A distinct failure state from **stale** (an old but
  same-day plan) — yesterday's "what to eat now" is not stale-but-usable, it's
  a plan for a day that no longer exists.

## The engine boundary (ADR-023, binding)
Clinical rules live only in the Python engine. This repo renders what the engine
computes and never decides a medical constraint. No floor, ceiling, cutoff or
interaction rule may be implemented in TypeScript.

**§6 (2026-08-20 grill):** this extends to captions. The engine emits the
authoritative caption sentence alongside its structured claims; this repo may
compose *presentation* from the claims (badges, ordering, emphasis, a
freshness wrapper built from a raw `computedAt` around the engine's sentence)
but may never compose a sentence that asserts anything clinical. A sentence
assembled in TypeScript is one step from TypeScript deciding what's true.
