# HealthOS

HealthOS is a proactive orchestration layer over health trackers. Where a tracker records what happened, HealthOS decides what should happen next: it derives a day of eating and training from the Athlete's goals and blood biomarkers, then re-routes that day as reality deviates from it.

## The Athlete

**Athlete**:
The person HealthOS plans for. The single subject of every Plan, Directive, and Confirmation in the system.
_Avoid_: user, client, patient, member

**Profile**:
The durable set of facts HealthOS plans from — the Athlete's Goals, Biomarkers, Slots, dietary constraints, and curated Meals. Established at onboarding and changed rarely.
_Avoid_: Onboarding Vault, user profile, settings, account

**Goal**:
A long-horizon outcome the Athlete is working toward, stated in words. A Goal carries no arithmetic; it selects which Targets matter.
_Avoid_: objective, aim, aspiration

**Macro Timeline**:
The mapping that turns a Goal into the day's Macro Targets. Where the Goal is the words, the Macro Timeline is the numbers they resolve to.
_Avoid_: macro plan, calorie plan, formula

**Biomarker**:
A measured blood value that HealthOS plans against, such as cholesterol or uric acid.
_Avoid_: lab value, marker, blood test

**Target**:
A quantity of a single Macro that the day should land on, taken from the Macro Timeline. A Target is aimed at, and may be missed.
_Avoid_: goal, limit, threshold

**Cap**:
A daily ceiling the day must stay under, derived from a Biomarker sitting outside its range — saturated fat for cholesterol, a purine and fructose allowance for uric acid. A Cap is not aimed at; it is obeyed. Caps outrank Targets: HealthOS will under-shoot a Target before it will break a Cap.
_Avoid_: limit, threshold, restriction, constraint

**Macro**:
A quantity of protein, carbohydrate, or fat, in grams.
_Avoid_: nutrient, macronutrient

## The Plan

**Plan**:
The full set of Directives for one day, ordered in time. There is exactly one Plan per day, and it is derived rather than stored.
_Avoid_: schedule, itinerary, program, routine

**Slot**:
One of the fixed structural blocks a day is divided into, each carrying a share of the day's Targets and holding exactly one Directive. Slots are defined in the Profile and give a Directive its time.
_Avoid_: block, window, mealtime, session

**Directive**:
One prescribed action placed at a time in a Plan: a Meal, a training session, a hydration cue. The unit the Athlete confirms, swaps, or deviates from.
_Avoid_: task, todo, recommendation, suggestion, reminder

**Meal**:
One pre-costed eating option defined in the Profile, with a known Footprint. The closed set of Meals is the only universe a Swap draws from.
_Avoid_: food, dish, recipe, menu item

**Footprint**:
The full nutritional cost of one eating event, held as a single unit: its Macros, its saturated fat, its purine and fructose load, and its Glycaemic Load. Every Meal carries one, and so does every Deviation.
_Avoid_: nutrition, macros, cost, nutritional profile

**Commitment**:
An external obligation from the Athlete's calendar that occupies time and constrains where Directives can be placed.
_Avoid_: meeting, event, appointment

**Swap**:
Replacing one Directive with an alternative that satisfies the same Targets. Offered by HealthOS, chosen by the Athlete.
_Avoid_: substitute, alternative, replace

**Closest Achievable**:
The state of a Plan whose remaining Slots cannot reach the day's Targets under any combination of Meals, so HealthOS prescribes the nearest day it can and says so. A Closest Achievable Plan still obeys every Cap.
_Avoid_: best effort, fallback, degraded, partial

## Reality

**Confirmation**:
The Athlete's tap asserting that a Directive happened as prescribed. The cheapest possible input, and the default path.
_Avoid_: log, check-in, entry, tracking

**Deviation**:
A gap between what a Directive prescribed and what the Athlete actually did — eating something else, skipping, training late. A Deviation carries the Footprint of what actually happened and is not confined to the Profile's Meals. A Deviation is an input, never a failure.
_Avoid_: cheat, slip, violation, non-compliance, failure

**Ledger**:
The append-only record of every Confirmation and Deviation. Together with the Profile and the current time, it is the complete input to a Plan.
_Avoid_: history, log, event store, journal

**Reroute**:
The recalculation of every remaining Directive in today's Plan after a Deviation, so the day lands as close to its Targets as its Caps allow. Named for the map metaphor: the route changes, the destination does not.
_Avoid_: recalculation, adjustment, correction, replan

**Headroom**:
What remains of the day's Targets and Caps after every Confirmation and Deviation so far — the budget a Reroute has to work with. Headroom on a Target may go negative; Headroom on a Cap may not be spent past zero.
_Avoid_: remaining macros, budget, allowance

**Glycaemic Load**:
A modelled estimate of the glycaemic impact of the Meals confirmed so far in a day, summed from per-Meal values held in the Profile. It is estimated from composition, never measured — HealthOS has no sensor.
_Avoid_: glucose, blood sugar, glucose stability, glycaemic index
