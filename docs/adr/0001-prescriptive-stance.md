---
status: accepted (MVP scope only; revisit before any public release)
---

# HealthOS prescribes rather than suggests

HealthOS tells the Athlete what to eat and when to train, in the imperative, rather than presenting options to consider. The prescriptive stance is the product: a tracker that suggests is precisely the thing HealthOS exists to replace, and softening the language would remove the only reason to choose it over the apps the Athlete already has.

## Considered options

**A proposal the Athlete adopts** ("here is what today should look like") was the alternative. It is the safer stance and the conventional one, and it was rejected because it produces a different product — one that puts the decision back on the Athlete, which is the cost HealthOS is meant to remove.

## Consequences

- **This is a decision about regulatory exposure, not only about copy.** "Prescribe", applied to a plan derived from blood biomarkers, is the vocabulary of regulated health advice in many jurisdictions. For a single-Athlete MVP where the only Athlete is the author, the exposure is bounded. Before any public release, this ADR must be reopened and the stance, the wording, the disclaimers, and the scope of biomarker-driven claims assessed together — not patched with a footer disclaimer.
- **The tone is load-bearing across the entire surface.** Directive copy, Reroute messages, and empty states are all written in the imperative. Reversing the stance later is a rewrite of the surface, not a configuration flag.
- **Prescriptive is not punitive.** A Deviation is an input, never a failure; Reroute messaging stays guilt-free. The system is directive about what comes next and silent about what went wrong.
