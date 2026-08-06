# HealthOS — Product DNA

> **Status: CANONICAL.** This document is the single source of truth for what HealthOS is and why.
> Every feature, refactor, and architectural decision must be traceable to this document.
> If a proposed change conflicts with this document, STOP and flag it to the founder — do not silently proceed.
> Last approved by founder: 2026-08-06

---

## 1. Mission (one sentence)

**HealthOS orchestrates nutrition, strain, and recovery in sync with the user's real life — every day, all the time — adapting instantly when life changes.**

It is not a logging app. It is not a meal planner. It is a closed-loop, biomarker-aware orchestration system that turns health data into daily action and re-plans the moment reality diverges from the plan.

## 2. The user thesis

- Athletes eat for performance, not joy — but the two can and must be combined for everyone else.
- An athlete will eat chicken and rice daily; an average user will churn. **Meal choice and enjoyment are retention mechanics, not nice-to-haves.**
- Discipline and structure are the foundation — athletes love structure. HealthOS's job is to translate athlete-grade structure into the life of the average person **without making it torture**.
- **Results are the #1 retention driver.** HealthOS is the "buddy that makes it all work" — visible progress is what makes users stick.

## 3. Canonical architecture (approved mockup, 2026-06-25)

The system is a closed loop with six blocks. Any architecture drift from this must be flagged.

### Block 1 — INPUTS
- Goals questionnaire (see §6 Onboarding)
- Blood test records
- InBody report upload (body composition)
- Wearable data: HRV, sleep, resting HR, activity

### Block 2 — HEALTH ENGINE (Health Profile & Planning Engine)
- Goal analysis
- Biomarker interpretation
- Body composition tracking
- Daily readiness
- Nutrition targets
- Recovery logic

### Block 3 — OUTPUT / DAILY PLAN (Daily Action Plan)
- Training suggestions
- Food intake guidance
- Supplement suggestions (including intake timing windows)

### Block 4 — FOOD GUIDANCE / LOGGING SCENARIOS
Four food scenarios, all first-class citizens:
1. **Cooking myself** — check what the user already has at home / in fridge
2. **Eat out** — including unplanned restaurant visits
3. **Food ordering** — extract exact order info from vendor (e.g. Grab); health vendors provide exact macros
4. **Food logging** — take photo → estimate macros

### Block 5 — DAILY USER FLOW
Wake up → Morning report (HRV, sleep, resting HR, current situation) → Meal decision support ("what should I eat now?") → Lunch / order recommendation → Training / supplements → Evening check-in → **Re-plan if needed**

### Block 6 — FEEDBACK LOOPS & ENGAGEMENT
- **Progress feedback:** InBody check (weekly) → Blood test (every ~3 months) → trend updates
- **Check-in map / social:** virtual activity map, friends see where you plan to go / went, momentum & social accountability
- **Dopamine hits:** morning clarity, easy next action, progress checkmarks, "save the day" with re-planning

## 4. Non-negotiable product principles

These are the DNA. Violating any of these is a design bug.

1. **Adapt all day, not once a day.** The plan is a living object. Any input change (meal deviation, training change, schedule change) triggers immediate re-orchestration of the remainder of the day. A plan that can't be revised mid-day is a broken plan.
2. **Cover the majority of real-life scenarios.** The system is judged by how it handles disruptions, not the happy path. See §5 Scenario Matrix.
3. **Friction is the enemy.** Photo + food recognition is crucial precisely because it removes logging friction. Existing compliance budget: max ~3 user messages/interactions per event. Every new feature must state its friction cost.
4. **Precision when possible, honest uncertainty when not.** Health-vendor orders → exact macros, tight guidance. Restaurant / photo estimate → a best-estimate value paired with an explicit confidence tier (HIGH/MEDIUM/LOW/PARTIAL), and the engine must reason and communicate accordingly (never present an estimate as a confirmed fact). Uncertainty is a first-class data type, whether expressed as a numeric range or a labeled point estimate. Lower confidence must produce more conservative engine behavior, not just different labeling.
5. **Timing is a nutrient.** WHEN matters as much as WHAT: carb timing around training can build muscle or spike glucose and store fat. Same logic applies to supplement intake windows. The engine schedules intake, not just amounts.
6. **Enjoyment is adherence.** Always offer meal choices/variety within targets. Optimize for "achieves the goal AND still enjoys life." Never design as if the user were a professional athlete unless their goal-mode says so.
7. **Results drive retention.** Every feedback loop (weekly InBody, quarterly bloods, trend updates) must surface visible progress back to the user. If progress isn't visible, the loop is incomplete.
8. **Biomarker-aware, always.** Recommendations must respect the user's blood markers and health data — this is what separates HealthOS from a macro calculator.
9. **Nutrition first, but never nutrition only.** Build order: nutrition → physical activity → recovery. But the architecture must never paint activity/recovery into a corner — the mission is orchestrating all three.
10. **"Save the day" is a feature.** When the user deviates, the system's response is rescue and re-plan, never guilt. Deviation handling is a dopamine moment, not an error state.
11. **Precision adapts to control.** The required level of guidance precision is not fixed — it scales with the user's current agency over their food (control_level: FULL/PARTIAL/MINIMAL/UNKNOWN). High control → gram-level plans. Low control → protect what matters (protein floor, safety rules), one high-leverage decision per eating occasion, zero precision theater. Forcing exact-macro interaction on a day the user cannot control food is a design failure, not a user failure. (Ratified: ADR-020, 2026-08-03.)
12. **The system proposes, it never disposes, on anything it doesn't own.** Autonomy scales with reversibility: HealthOS freely adjusts what it already owns (today's plan, portions, slot timing, next-best-action) but only *proposes* — with one-tap accept/decline, never pre-applied — anything touching the user's calendar, clinical scheduling, or commitments to other people. Medication changes, new-supplement recommendations, and overriding a hard medical rule are refused and surfaced, never silently done. (Ratified: ADR-021, 2026-08-06.)

## 5. Scenario coverage matrix (the adaptation contract)

The Health Engine must handle at minimum these scenario classes. Use this as the acceptance-test checklist for the orchestration layer.

| # | Scenario class | Example | Required system behavior |
|---|---|---|---|
| S1 | Meal plan breaks with zero notice | Planned to eat X, ends up at a restaurant | Instant re-plan; range-based macro estimate (photo/menu); rebalance remaining meals of the day |
| S2 | Training changes same day | Trains more, less, different type, or skips | Recompute energy/carb targets, meal timing, and supplement windows for the rest of the day |
| S3 | Meal timing shifts | Late lunch, training moved | Re-time carb windows and supplement windows relative to new training time |
| S4 | Precise-data path | Order from health food vendor with exact macros | Use exact macros; tighter recommendations; easiest path — actively prefer suggesting it |
| S5 | Imprecise-data path | Photo of restaurant plate, verbal description | Estimate with ranges; propagate uncertainty; adjust conservatively |
| S6 | Supplement adherence | Missed or shifted intake window | Reschedule or skip per interaction rules (e.g. timing-sensitive vs anytime) |
| S7 | Recovery signal contradicts plan | Poor HRV/sleep before hard session | Readiness-adjusted training + nutrition recommendation |
| S8 | Multi-day drift | Several days off-target | Trend-level correction plan, not just daily patch; no guilt framing |

**Definition of done for the orchestration layer: a random scenario from this table thrown at the system at a random time of day produces a coherent, biomarker-consistent revised plan within the friction budget.**

## 6. Onboarding spec (goal & baseline capture)

Status: **does not exist yet — must be built.** This is a differentiator: Perplexity Health (perplexity.ai/health) onboards connector-first (medical records via b.well, wearables via Terra API, Apple Health, encrypted health-file uploads) but captures **no goal, no baseline objective, no timeframe**. HealthOS must do both: data connection AND goal contract.

### Step 1 — Data & baseline intake (mirror Perplexity Health's connector pattern)
- Upload blood markers / lab results (file upload path)
- Upload InBody / body-composition report
- Connect wearable (HRV, sleep, resting HR, activity)
- Any other health scans / documents
- Output: a **baseline snapshot** the engine treats as t₀.

### Step 2 — Goal contract (what Perplexity Health lacks; our core)
- **Objective:** what the user wants to achieve (recomposition, performance, health-marker correction, etc.)
- **Timeframe:** target date / horizon for the goal
- **Goal mode (explicit trade-off choice):**
  - **Strict & healthy:** follow biomarkers strictly; slower but sustainable
  - **Fast & aggressive:** reach the goal faster, accepting less-healthy trade-offs
  - The engine's daily orchestration behavior MUST change based on this mode — it is not a label, it is a policy switch.
- **Lifestyle constraints:** food preferences, eating-out frequency, training schedule, supplement stack.

### Step 3 — Adoption mechanism check
Onboarding is only complete when the engine can answer: "given this baseline, this objective, this timeframe, and this goal mode — what is today's plan?" If it cannot, onboarding capture is insufficient by definition.

## 7. Roadmap sequencing

1. **Now:** Nutrition orchestration end-to-end (scenarios S1–S6), onboarding spec (§6), food recognition / macro estimation with ranges.
2. **Next:** Physical activity — training suggestions driven by readiness + goal mode.
3. **Then:** Recovery — sleep/HRV-driven recovery logic closing the loop.
4. **Continuous:** Feedback loops (Block 6) and engagement/dopamine mechanics grow with each stage.

## 8. Open questions (founder to decide — agent must NOT decide these unilaterally)

- Supplement recommendation scope: guidance on user's existing stack vs. proactively recommending new supplements (regulatory/liability surface).
- Social layer (check-in map, friends visibility): build order and privacy model.
- How aggressively the "fast & less healthy" mode is allowed to deviate from biomarker guidance (needs explicit guardrails).
