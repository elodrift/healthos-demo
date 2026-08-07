# CLAUDE.md — read this before writing any code

## 1. The canonical documents

`docs/PRODUCT_DNA.md` is **CANONICAL**. It is the founder's product
specification, not a summary someone wrote afterwards. Read it in full before
you touch anything.

It carries an instruction that binds you:

> If a proposed change conflicts with this document, STOP and flag it to the
> founder — do not silently proceed.

`docs/DEMO_SPEC.md` is the build spec for this demo: what it must show, what it
must never claim, and how fixture data must be marked.

Neither file is a suggestion. If this file and those two ever disagree, **they
win** and this file is the thing that is wrong.

## 2. Two rules that have already been broken once

An agent (v0) violated both of these while building the community layer. They
are called out first because they are the failure modes this codebase actually
experiences, not hypothetical ones.

### 2.1 §8 decisions are not yours to make

`PRODUCT_DNA.md §8` lists open questions reserved for the founder. The social
layer's **build order and privacy model** is one of them.

v0 was asked for a friend check-in map — which is canonical architecture in
DNA Block 6 — and talked the founder *out of it* using a "thesis" it had
inferred from the conversation rather than read from the doc. That was a §8
decision made unilaterally, against the spec, on invented grounds.

If you find yourself constructing an argument for why a canonical feature is a
bad idea: stop and ask. You may be right, but it is not your call, and a
plausible-sounding rationale is exactly what this failure looked like from the
inside.

### 2.2 Every invented fixture value must be marked

`DEMO_SPEC.md §4`: no fixture value invented by the agent without marking it
`[ASSUMPTION]`.

v0 authored an entire community dataset — venue names, log counts, kcal ranges —
with zero markers, including real restaurant names attached to invented
nutrition numbers. Both were fixed: see the banner at the top of
`lib/fixtures/community.ts`.

Place names in fixtures are now deliberately descriptive ("Wok stall — north
lane") and **must stay that way**. The demo must never make a factual-looking
nutritional claim about a business that exists.

## 3. Product rules that constrain code, not just copy

These come from the DNA. They are listed here because each one has a concrete
implementation consequence that is easy to break by accident.

- **The system proposes, the user disposes** (§4.12). Nothing auto-applies. A
  reply that changes targets must offer choices, not announce a change.
- **Medical rules never suspend.** `accent-red` is reserved for the
  never-suspends card. Do not spend that colour anywhere else — it is the one
  signal in the product that must never compete for attention.
- **Never claim precision the data does not support.** If headroom is not
  actually there, say so. There is a fixed test for this: a "can I fit X" reply
  on a spent day must refuse, not reassure.
- **Community data narrows estimates; it never overrides a rule.** A dish that
  trips a bloodwork ceiling still trips it at 412 logs.
- **Uncertainty is sometimes irreducible.** Some dishes' variance is the user's
  own portion. More community data cannot fix those, and the UI must not imply
  it can — see `tightestVenue()`, which returns `null` rather than claim a
  benefit that is not in the numbers.

## 4. Where things are

```
app/day/            the demo route
components/         UI. DemoShell is the top-level composition
components/cards/   the typed agent cards (proposals, never-suspends, …)
lib/store.ts        zustand store; all demo state and actions
lib/agent/respond.ts  deterministic reply beats — the "rules engine"
lib/agent/nlu.ts      intent matching
lib/fixtures/       all demo data. community.ts carries the [ASSUMPTION] banner
lib/reducer.ts      event reducer for the engine pane
docs/               PRODUCT_DNA.md (canonical) + DEMO_SPEC.md
```

Reply beats are deterministic and live in `respond.ts`. The demo labels which
component answered (`rules engine` vs `language model`) and that label must stay
truthful — it is the argument the demo is making.

## 5. Current state

Built and verified in-browser at mobile portrait (302px), which is the primary
surface:

- Scripted day with free-typing escape hatch, engine pane, timeline scrubber
- Community screen with two views behind a segmented control:
  - **Feed** — ranked by *uncertainty*, not popularity. `DishLearnMore.tsx`
    gives per-dish variance explanation, per-venue ranges, and a logging tip.
  - **Check-ins** — DNA Block 6 map (`CheckInMap.tsx`), react-leaflet 4.2.1,
    friend `planned` / `went` pins.
- `joinPlan` records a plan and emits **no** `FOOD_LOGGED` event. Joining must
  never move the macro header. This is §4.12 applied to a future meal and is
  worth an explicit test if you refactor the store.

Known-deliberate gaps: two dishes have no venue data, because not every dish
needs every feature. The map covers one city; friends elsewhere are surfaced as
a count rather than dropped silently.

## 6. Working practice

- `npm run dev` — do **not** run `npm run build` against a running dev server.
  It overwrites the dev client chunks, `main-app.js` starts 404ing, and the app
  silently stops hydrating: buttons do nothing and the cause is invisible.
- Verify UI changes at 302px before calling them done. A clean type-check is not
  evidence that anything works.
- Fixture arithmetic is checked, not trusted — venue log counts sum to each dish
  total. Keep it that way; a demo arguing about uncertainty cannot afford
  arithmetic that does not hold.
