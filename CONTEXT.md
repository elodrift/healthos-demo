# CONTEXT — the language of this codebase

## The core idea
A number about food is a *claim*. Every claim carries how it is known.
Presenting an inferred number as a measured one is the one unforgivable bug.

## Vocabulary
- **MEASURED** — from a scale or a manufacturer's label.
- **ASSUMED / estimated** — inferred. Almost everything is this.
- **portionBasis** — how the portion size is known.
  - `MANUFACTURER`: the packet publishes a serving size.
  - `UNKNOWN`: nothing published; the user must supply grams. Never invent one.
- **weighed** — the user put it on a scale. A barcode scan alone is NOT weighed.
- **estimated: false** — only when source is `barcode` AND `weighed` is true.
- **floor vs target** — different promises. Clearing a floor is a success;
  missing a target is not. `proteinKind` decides which verb the UI uses.
- **confidence** — LOW / MEDIUM / HIGH, describing what the *user accepted*.
- **controlLevel** — FULL / PARTIAL / MINIMAL / UNKNOWN.
- **timeBasis** — `photo-capture` or `upload`: which clock filed the meal.
- **local day** — a meal belongs to the user's local day, never the server's.
- **§4.11** — the rule against presenting the app's guess as the user's intent.

## The engine boundary (ADR-023, binding)
Clinical rules live only in the Python engine. This repo renders what the engine
computes and never decides a medical constraint. No floor, ceiling, cutoff or
interaction rule may be implemented in TypeScript.
