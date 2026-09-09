---
status: accepted (MVP scope only; reopens with ADR-0001)
---

# Biomarker Caps are derived in the engine, not stated in the Profile

The Profile records the Athlete's Biomarkers; the engine turns a Biomarker sitting outside its range into the Cap that constrains the day — High Cholesterol into a 15g daily saturated fat ceiling, High Uric Acid into a capped purine and fructose allowance. The rules live in code because they are the product: a system that reads daily limits out of a settings file is a macro calculator, and the Athlete already has one of those.

## Considered options

**Holding the Caps as static Profile facts** — the Athlete (or their clinician) states "saturated fat ≤ 15g" directly, and HealthOS merely obeys it — was the alternative, and it is the safer one in every respect except the one that matters. It keeps the arithmetic honest and testable with no clinical rules in the codebase, and it moves the judgement off the system and onto whoever authored the number. It was rejected because it removes the causal link between blood work and the day, which is the entire claim HealthOS makes.

## Consequences

- **This is the surface ADR-0001 warns about.** Deriving a dietary ceiling from a blood biomarker, in the imperative, is regulated health advice in many jurisdictions — and unlike tone, it cannot be softened with wording. ADR-0001's reopening condition covers this decision too: before any public release, the derivation rules, their provenance, and the claims made about them must be assessed together. For a single-Athlete MVP where the only Athlete is the author, the exposure is bounded.
- **The rules need provenance they do not currently have.** The two thresholds encoded here are working assumptions, not sourced clinical guidance. Each Cap rule should carry a citation before it constrains anyone but the author.
- **Caps outrank Targets, and that ordering is structural.** A Reroute under-shoots a Target rather than break a Cap, so infeasibility surfaces as a Closest Achievable Plan rather than as a quietly relaxed ceiling. Reversing the priority would change what the engine returns on every constrained day.
- **A new Biomarker means new code, not new data.** Adding a Cap rule is a change to the engine with its own tests, which is deliberate: each rule is a claim about health, and claims deserve review.
