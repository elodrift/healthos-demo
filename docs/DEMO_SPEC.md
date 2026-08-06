# HealthOS Interactive Demo — Spec & Architecture

> Purpose: a public, Vercel-hosted, interactive demo that lets anyone experience the
> HealthOS closed loop in ~3 minutes — without touching the real engine, real health
> data, or real accounts. It sells the DNA: adapt all day, honest uncertainty,
> save-the-day, results.

## 0. Non-negotiable guardrails

1. **No engine fork.** Zero planning/diagnosis logic ported from the Python core. All
   "intelligence" is pre-authored scenario fixtures. If a demo behavior and the real
   engine ever disagree, the demo is wrong by definition.
2. **No health data.** No uploads, no accounts, no persistence beyond localStorage.
   A visible "Simulated demo — not medical advice" label in the footer.
3. **Demo state is an event log.** UI state = `reduce(events)`. Same mental model as
   production (event store = truth). This keeps the demo honest and makes it a
   teaching artifact for the architecture itself.
4. **The demo showcases the DNA, not features.** Every screen must map to a DNA
   principle; anything that doesn't is cut.

## 1. What the user experiences (the script)

A guided "one day with HealthOS" simulation, playable in ~3 minutes, with free
exploration after.

### Act 1 — Onboarding (the differentiator, DNA §6)
- 3-step goal contract, deliberately minimal:
  1. Pick a persona (pre-filled baselines — e.g. "Athletic, lipid markers elevated" /
     "Desk job, wants recomposition"). Personas stand in for blood/InBody uploads —
     show the upload UI as a disabled "connect your data" preview.
  2. Pick objective + timeframe (slider).
  3. Pick goal mode: **Strict & sustainable** vs **Fast & aggressive** — with a visible
     consequence preview ("your daily plan will differ — watch for it").
- Payoff screen: "Your baseline → your plan for today." Targets shown WITH provenance
  ("protein floor from your lipid profile" — biomarker-aware, DNA §4.8).

### Act 2 — The day (Block 5 flow, condensed to 5 beats)
Timeline scrubber across the top (06:30 → 22:00). Each beat is a card:
1. **06:30 Morning briefing** — readiness (simulated HRV/sleep), whole-day plan, totals.
2. **12:30 Meal push** — slot-timed suggestion with the "why" visible.
3. **15:00 THE DISRUPTION (user chooses one):**
   - "Ended up at a restaurant" → S1: photo-style estimate appears with a confidence
     tier (MEDIUM), ranges not fake precision, rest of day rebuilds live.
   - "Skipped my training" → S2: targets REVISE downward with an animated
     before/after; morning meals stay green ("judged against the plan that existed
     when you ate" — no retroactive re-scoring); dinner shifts protein-forward.
   - "Trained harder than planned" → targets revise up, carb window opens.
4. **19:00 Evening check-in** — cause-aware diagnosis: "over revised target — plan
   changed, not overeating" rendered as a calm state, never red/guilt.
5. **21:00 Day close** — known / uncertain / what-mattered summary + one
   "save-the-day" recap showing what the system did when reality diverged.
- Goal-mode payoff: the SAME disruption produces visibly different guidance in
  strict vs fast mode (two fixture branches). This proves goal mode is a policy
  switch, not a label.

### Act 3 — The loop (Block 6)
- A "4 weeks later" screen: trend chart (weight, adherence, a biomarker delta),
  driven by fixture data per persona × goal mode. Message: results drive retention.
- CTA: waitlist email capture (Vercel KV or a simple form endpoint) — optional v2.

## 1.5 Presentation layer — LOCKED to the Journey Frames mockup

Canonical visual reference: `HealthOS_Journey_Frames_Part1_Updated.pdf` (28 frames,
committed to this repo under `design/`). The demo is NOT a card-timeline dashboard —
it is a **phone-framed, chat-first replay** matching the frames:

- **Persistent header:** live macro bars (protein, kcal) that visibly update as the
  conversation progresses — the state change IS the feedback.
- **Two tabs:** **The channel** (the conversation) and **The engine** (the audit view:
  the event log and every decision with its logged reason, updating in lockstep with
  the chat). The engine tab is the differentiator — it shows the deterministic core
  thinking, which no AI-wrapper demo can honestly render. Every chat beat appends
  visible events there.
- **Structured cards inline in chat**, exactly as in the frames: planned-variance card
  ("not a cheat day — a day with different tolerances"), medical NEVER-SUSPENDS card
  (rendered in warning red, e.g. Grapefruit × Amlodipine, red meat ≤ 2/week — uric
  acid), target-revision before/after card.
- **Voice:** the frames' copy is the fixture copy — use it verbatim wherever a frame
  exists (the boat-trip exchange is the S1/planned-variance scenario script). New copy
  must match that voice: direct, reasoned, pushes back on framing, never moralizes.
- **Interaction model:** the user doesn't free-type in v1 — they choose from 2–3
  suggested user-message chips at each beat ("boat trip saturday, all day thing…",
  "skipped my training", "ended up at a restaurant"). Each chip appends its scripted
  exchange to the chat and its events to the engine tab. Typing indicator + staged
  message reveal for realism.
- Onboarding (Act 1) and results (Act 3) keep their own screens but inherit the same
  dark visual system as the frames.

## 1.6 UX engagement upgrades (the frames are a draft — exceed them)

The PDF fixes the concept and voice, not the ceiling. Build these on top:

1. **Cause → effect must be FELT.** When targets revise or macros consume, numbers
   count up/down and bars morph with spring motion (350–500ms) — never snap. The
   header is the heartbeat of the demo; if it doesn't visibly react to every beat,
   the loop is invisible.
2. **Desktop = side-by-side, mobile = tabs.** On ≥lg screens show the phone-framed
   channel AND the engine panel simultaneously — a chat message lands, its events
   light up beside it. Seeing cause and audit trail at once is the "whoa" moment;
   don't hide it behind a tab where a screen fits both.
3. **Engine events arrive as a live feed** — each entry slides in with its reason
   line and links back to the chat beat that caused it (hover/tap highlights both).
4. **Pacing is theater.** Typing indicator, 600–900ms staged reveals, cards unfold
   after their message. Never dump a scripted exchange at once. Auto-play with
   tap-to-advance override; a subtle timeline scrubber to replay any beat.
5. **The disruption is a scene, not a message.** When the user picks a disruption
   chip, dim the stage briefly, then play the adaptation: old targets slide out,
   revised slide in with the cause tag ("training skipped → targets revised"),
   morning meals visibly stay green. This is the single most important animation
   in the product — budget polish here first.
6. **Contrast & type discipline.** The draft's low-contrast gray-on-navy fails
   readability — body text ≥ 4.5:1, one accent (green) reserved for positive state,
   red reserved exclusively for the medical never-suspends card so it lands like a
   guardrail, amber for plan-diverged. Type scale: numbers tabular and LARGE — the
   macros are the protagonist.
7. **End with a shareable artifact.** Day-close generates a "my day with HealthOS"
   summary card (known / uncertain / what-the-system-saved) with an OG image — the
   demo's built-in distribution loop.
8. **15 seconds to first wow.** No signup, no explainer wall: land → one line →
   "start the day" → first briefing within two taps. Onboarding depth (personas,
   goal contract) can come AFTER the first scene for visitors who stay.

## 2. Architecture

```
Next.js 14+ (App Router, TypeScript) on Vercel
├── app/
│   ├── page.tsx                  # landing: one-line mission + "Start the demo"
│   ├── onboarding/               # Act 1 (3 steps, client components)
│   ├── day/                      # Act 2 (timeline player)
│   └── results/                  # Act 3
├── lib/
│   ├── events.ts                 # event types (mirror prod NAMES: FOOD_LOGGED,
│   │                             #   TRAINING_CHANGED, TARGETS_REVISED, DAY_CLOSED…)
│   ├── reducer.ts                # pure fn: events → UI state (the only "engine")
│   └── fixtures/                 # ALL intelligence lives here
│       ├── personas/*.json       # baselines, targets, provenance strings
│       ├── scenarios/*.json      # per disruption × goal mode: the events to append
│       └── copy.ts               # diagnosis copy (cause-aware, non-guilt)
├── components/                   # phone frame, chat stream, message chips,
│                                 # inline cards (variance / medical / revision),
│                                 # engine-tab event feed, confidence badge, macro bars
└── state: Zustand store holding the event log + derived selectors
```

- **No backend for v1.** No API routes, no DB. Scenario picks append fixture events
  to the client-side log; the reducer recomputes. localStorage for resume.
- **Optional v2 additions (each independent):** waitlist endpoint (Vercel KV);
  free-text food input parsed by an LLM API route with strict output schema and a
  clamp (mirrors prod's language-edge pattern — still never computes targets).
- **Styling:** Tailwind + shadcn/ui; framer-motion ONLY for the three dopamine
  moments (target revision, save-the-day rebuild, progress checkmarks) — motion is
  meaning, not decoration.
- **Analytics:** Vercel Analytics + three custom events: demo_started,
  disruption_chosen (which), demo_completed. That's the funnel that matters.

## 3. Data model (the whole thing)

```ts
type DemoEvent =
  | { t: "SESSION_OPENED"; targets: Targets; cause: "persona_baseline" }
  | { t: "FOOD_LOGGED"; slot: Slot; macros: Macros; confidence: "HIGH"|"MEDIUM"|"LOW"; snapshotVersion: number }
  | { t: "TRAINING_CHANGED"; change: "skipped"|"harder"|"different" }
  | { t: "TARGETS_REVISED"; targets: Targets; causeEventIdx: number }
  | { t: "DAY_CLOSED"; summary: DaySummary };

type Targets = { kcal: number; protein_g: number; carbs_g: number; fat_max_g: number;
                 provenance: Record<string,string> };  // "protein floor ← lipid profile"
```

Reducer rules (the only logic allowed):
- current targets = latest TARGETS_REVISED else SESSION_OPENED
- each FOOD_LOGGED is scored against the snapshotVersion it carries (no re-scoring)
- remaining = targets − consumed, floored at zero
- diagnosis state machine: on_track | over_by_choice | over_by_revision | uncertain
  (strings chosen per fixture copy, cause always shown)

## 4. Build plan (hand to Claude Code as 3 slices)

1. **Slice 1 — skeleton + chat replay of the boat-trip scenario (the frames, made
   interactive), one persona, one goal mode — channel tab AND engine tab.** This is
   the demo's heart; if it doesn't land, nothing else matters. The 28 frames are the
   acceptance criteria: the built scenario must read beat-for-beat like the PDF.
2. **Slice 2 — Act 1 onboarding + goal-mode branching of the same scenario.**
3. **Slice 3 — S1 restaurant + trained-harder scenarios, Act 3 results, polish pass
   (motion, responsive, share/OG image).**

Each slice: deployable to Vercel preview, reviewed against this spec, no fixture
value invented by the agent without marking it [ASSUMPTION].

## 5. Vercel specifics

- Repo: separate from the engine repo (e.g. `healthos-demo`) — different cadence,
  different gates, and it keeps demo churn out of the audited engine history.
  Copy PRODUCT_DNA.md into it read-only; its CLAUDE.md points there.
- `vercel` connects to the GitHub repo → every push = preview URL, main = production.
- Domain: demo.<yourdomain> later; *.vercel.app is fine to start.
- Gates for this repo (lighter than the engine): typecheck + eslint + build on CI;
  no /code-review requirement except on reducer.ts changes.

## 6. Explicitly out of scope

- Real photo recognition, real LLM planning, real wearable connections
- Accounts, auth, any persistence of user-entered health information
- Telegram integration or any call into hermes-prod
- Porting constraint/guard/planner logic — if the demo needs "smarter" behavior,
  author a better fixture, never write logic
