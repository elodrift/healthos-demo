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

### 2.3 An external design audit does not outrank the spec

A Modernist redesign audit was delivered as a PDF (dropped in `.v0/feedback/`,
gitignored). Its UX findings were sharp and several are now implemented — but
its visual direction contradicted `DEMO_SPEC.md §1.5`, *"Presentation layer —
LOCKED to the Journey Frames mockup"*, and it said so on page 2: it had been
written **without** the journey-frames reference, which is in the repo at
`design/journey-frames.pdf`.

The founder's ruling, on the record:

- **Adopt** the non-conflicting UX fixes only.
- **Reject** the light theme, Archivo, zero-radius, wizard-replaces-chat, and
  engine-demoted-to-a-drawer changes. Dark, chat-first, engine-visible stands.
- **Red stays medical-only.** The audit used red for its primary CTA while its
  own page 6 said *"red never means bad performance, only that a medical rule is
  in view."* `DEMO_SPEC §1.6.6` agrees. The audit lost to itself here.

The lesson generalises: a document arriving later, with more confidence and
better typography, is still not canonical. Check it against the two docs in
`docs/` and flag the conflict instead of implementing the newest thing you read.

### 2.4 Live mode graduated past DEMO_SPEC; the demo path did not change

`DEMO_SPEC.md` lists as non-goals exactly what real WHOOP data requires: *"No
health data"* (§13), *"No backend for v1"* (§146), *"real wearable
connections"* (§203). `PRODUCT_DNA.md §97` pulls the other way — onboarding
*"does not exist yet — must be built"*, with wearable connection named as a
differentiator.

The founder's ruling, on the record:

- **Dual mode.** The scripted `/day` replay stays exactly as specced, for
  pitching without a login. Real WHOOP data lives in a separate authenticated
  **Live mode**. A change to Live mode must not touch the demo path.
- **WHOOP now; Garmin marked honestly unavailable.** The Garmin Health API is
  closed to new third-party developers — the application form is gone and
  access is restricted to enterprise partners. A "Connect Garmin" button would
  be theatre, which §4.11 forbids. Reaching Garmin later means an aggregator
  (Terra, Vital), which is a paid dependency and a separate decision.
- **Photos are content, not a fix.** See §2.5.

### 2.5 Two claims I made that measurement disproved

Both were plausible, confidently stated, and wrong. Recorded so they are not
repeated or "re-fixed" on my authority.

- **"The feed ships 16 MB of images to mobile."** It does not. `next/image` is
  active with correct `sizes` and no `unoptimized` flag, so a 2090 KB source
  PNG is served as **8 KB** at a 302 px viewport — a 99.6% reduction that was
  already happening. The 16 MB is repo weight only. There was no performance
  bug; the image task was deleted rather than "fixed".
- **"Register `https://healthos-3.v0.build/...` with WHOOP."** That origin is
  **not public**. It answers `302` to `v0.app/chat/unauthorized`, because the
  preview is scoped to the authenticated chat. WHOOP cannot fetch a privacy
  policy behind it, and an OAuth callback would be bounced through the gate.
  Both URLs must come from the published Vercel domain.

The pattern in both: an assumption about the platform, asserted instead of
measured. `curl` the origin and measure the transfer before advising.

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
- **Proposals are selectable** (`components/cards/ProposalsCard.tsx`). The card
  used to be a read-only list under the words "your call", so the §4.12 promise
  was made and then not honoured — there was nothing to dispose *with*. Choosing
  writes `chosenProposals[beatId]` and shows a receipt. Like `joinPlan`, it emits
  no event and moves no macro: committing to a plan is not eating.
- **Over target reads neutral, never red** (`MacroHeader.tsx`). Consumed used to
  stay brand-green while the bar clamped at 100%, so 224g against a 205g target
  looked exactly like hitting it. It now drops to `ink-hi` with a `(+19g)` delta.
  Deliberately not red — being over on carbs is information, a medical rule
  breach is not, and the two must not look alike.
- Scrubber stops are 44px minimum (were 34px), and setup is three steps, not
  four: the goal step had nothing to decide on it.

One audit finding was **not** real: it claimed `scrollIntoView` fought user
scroll. There was no `scrollIntoView` in the codebase — `ChatStream` uses a
container-scoped `scrollTo` with a deliberate observer-loop guard. Verify claims
against the code before you act on them, including the ones in this file.

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
