/**
 * findNakedNumbers — a structural guard against fake precision.
 *
 * CONTEXT.md states the product's one inviolable rule: a number is never shown
 * without saying where it came from. That rule is enforced today by discipline
 * and by the caption suite, both of which act at the point of *rendering*. This
 * walker moves part of the enforcement earlier, to the point where a payload is
 * serialised, and makes the cheap half of the rule mechanical:
 *
 *   every numeric nutrition field must sit in an object that also carries a
 *   provenance sibling.
 *
 * WHAT THIS CANNOT DO, stated plainly so nobody mistakes a green run for proof:
 * it checks that provenance is *present*, never that it is *true*. An object
 * claiming `{ proteinG: 31, confidence: "HIGH" }` about an eyeballed portion
 * passes this walker and is exactly the lie the barcode "I weighed this" gate
 * exists to prevent. Honesty of a claim is asserted in tests/captions; this is
 * the structural floor beneath it, not a replacement for it.
 *
 * Deliberately dependency-free and side-effect-free: it is imported by a route
 * helper in dev AND executed by an offline test script in CI, where there is no
 * database, no network, and no browser.
 */

/** Numeric fields that carry a nutrition claim, keyed by lowercase name. */
const NUTRITION_FIELDS = new Set([
  "kcal",
  "kcalburned",
  "calories",
  "protein",
  "proteing",
  "carbs",
  "carbsg",
  // `carbG` — singular — is the spelling `lib/food/barcode.ts` and
  // `app/api/meals/route.ts` actually ship. Its absence here meant every
  // carbohydrate figure in the app passed the guard unchecked.
  "carbg",
  "fat",
  "fatg",
  "fiber",
  "fiberg",
  "sugar",
  "sugarg",
  "sodium",
  "sodiummg",
  "grams",
  "portiongrams",
  "servinggrams",
  // Same defect class as `carbg`: `servingG` is the spelling `BarcodeLookup`
  // actually ships, and only `servingGrams` was covered.
  "servingg",
]);

/**
 * Fields that answer "where did this come from?".
 *
 * These are exactly the five named by standing rule 5, no more. The set had
 * drifted wider (`source`, `weighed`, `measured`, `provenance`, `range`, `low`,
 * `high`) which quietly widened the rule the guard was supposed to enforce:
 * per CONTEXT.md, `source` and `weighed` are the *inputs* that decide
 * `estimated`, not provenance in their own right, so accepting them let an
 * object satisfy the guard without ever stating what it knew.
 *
 * `portionbasis` and `timebasis` must be listed explicitly. This is a Set of
 * exact lowercase names, so `basis` does not match `portionBasis` — their
 * absence was a live false positive on every successful barcode lookup.
 */
const PROVENANCE_FIELDS = new Set([
  "estimated",
  "confidence",
  "basis",
  "portionbasis",
  "timebasis",
]);

/**
 * Container keys whose own name states the basis of the numbers inside them.
 *
 * `per100g: { kcal: 539, carbG: 57 }` is not fake precision: "per 100 g" says
 * exactly what those figures are measured against, which is the whole of what
 * the rule asks for. The numbers have no provenance *sibling* because the
 * provenance is the key above them.
 *
 * This is deliberately narrow, and it is NOT the general "inherit provenance
 * from any ancestor" rule that the walker exists to refuse — a `confidence` on
 * an envelope still says nothing about which of twelve meals it describes.
 *
 * Scope, stated exactly, because the first version of this comment claimed a
 * guarantee the code did not deliver: these keys cover the numeric fields of the
 * object they name, reached either directly (`per100g: {...}`) or across a single
 * array layer (`per100g: [{...}]`). Nothing deeper — not an object under an
 * object, and not an array under an array, which is the case that escaped. Both
 * axes are pinned by tests in `scripts/test-provenance.ts`.
 *
 * Distinct from IGNORED_CONTAINER_KEYS on purpose: these values *are* nutrition
 * claims and should keep being walked, they are simply self-describing.
 */
/*
 * Exactly one key, because exactly one exists.
 *
 * `per100g` is the only basis-declaring container the app ships: `parseProduct`
 * reads the hardcoded `*_100g` Open Food Facts fields and writes the single
 * `per100g` field on `LabelPer100g`. There is no second shape.
 *
 * `per100`, `perServing` and `per100ml` were all here and are all gone, for the
 * same reason: no call site. The first two I invented outright. `per100ml` was
 * the more seductive mistake — it sounds like a real label convention, and it is
 * one in the world, but not in this codebase: `BarcodeLookup` has one field
 * always named `per100g` whether the product is solid or liquid, and
 * `LABEL_NO_SERVING` is already a liquid shipping under `per100g`. The comment
 * that justified it claimed a drink would arrive under `per100ml` "the first time
 * one is scanned" — false against the code as it stands, and unverified when
 * written.
 *
 * Every speculative entry widens the rule for a shape that does not exist,
 * against no test. Add a key here only alongside the payload that needs it.
 */
const BASIS_DECLARING_CONTAINERS = new Set(["per100g"]);

/**
 * Keys whose numeric contents are not nutrition claims and must not be flagged.
 * Without this the walker cries wolf on pagination and timestamps, and a guard
 * that cries wolf gets switched off — the failure mode that matters most here.
 */
const IGNORED_CONTAINER_KEYS = new Set([
  "meta",
  "pagination",
  "page",
  "cursor",
  "headers",
  "timing",
  "debug",
]);

export type NakedNumber = {
  /** Dotted path to the offending field, e.g. `meals[2].proteinG`. */
  path: string;
  /** The field name as it appears in the payload. */
  field: string;
  /** The value that lacked provenance. */
  value: number;
  /** Sibling keys present on the same object, to make the report actionable. */
  siblings: string[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Walk a payload and report every numeric nutrition field whose own object
 * carries no provenance sibling.
 *
 * Provenance is required in the SAME object, not merely somewhere up the tree:
 * a `confidence` on the envelope says nothing about which of twelve meals it
 * describes, and treating it as cover for all of them is precisely how a
 * measured figure and a guess end up looking identical.
 */
export function findNakedNumbers(input: unknown): NakedNumber[] {
  const found: NakedNumber[] = [];
  const seen = new WeakSet<object>();

  function walk(node: unknown, path: string, ignored: boolean, basisDeclared: boolean): void {
    if (Array.isArray(node)) {
      /*
       * Carry basisDeclared across ONE array hop, so `perServing: [{...}]`
       * behaves the same as `perServing: {...}` — the array is just how the rows
       * are held, and the key above it still describes them.
       *
       * It must not survive a second hop. An array has no key of its own to
       * recompute the flag against, which is what the object branch below uses
       * to reset it; forwarding unchanged therefore let the flag ride
       * indefinitely, and `per100g: [[{ kcal: 500 }]]` came back clean at any
       * depth. That is the inherit-from-any-ancestor behaviour this guard exists
       * to refuse, reachable through the array axis instead of the object one.
       *
       * Resetting on a nested array is the narrow reading: "per 100 g" describes
       * the rows one level down, and says nothing about a list of lists.
       */
      node.forEach((item, i) =>
        walk(item, `${path}[${i}]`, ignored, Array.isArray(item) ? false : basisDeclared),
      );
      return;
    }
    if (!isPlainObject(node)) return;

    // Cycles: a payload built from live objects can self-reference.
    if (seen.has(node)) return;
    seen.add(node);

    const keys = Object.keys(node);
    const hasProvenance =
      basisDeclared || keys.some((k) => PROVENANCE_FIELDS.has(k.toLowerCase()));

    for (const key of keys) {
      const value = node[key];
      const childPath = path ? `${path}.${key}` : key;
      const childIgnored = ignored || IGNORED_CONTAINER_KEYS.has(key.toLowerCase());

      if (typeof value === "number") {
        if (
          !childIgnored &&
          NUTRITION_FIELDS.has(key.toLowerCase()) &&
          !hasProvenance &&
          Number.isFinite(value)
        ) {
          found.push({ path: childPath, field: key, value, siblings: keys.filter((k) => k !== key) });
        }
        continue;
      }

      walk(value, childPath, childIgnored, BASIS_DECLARING_CONTAINERS.has(key.toLowerCase()));
    }
  }

  walk(input, "", false, false);
  return found;
}

/** Human-readable one-line summary per finding, for logs and test output. */
export function formatNakedNumbers(found: NakedNumber[]): string {
  return found
    .map(
      (f) =>
        `  ${f.path} = ${f.value} (no provenance sibling; has: ${
          f.siblings.length ? f.siblings.join(", ") : "nothing else"
        })`,
    )
    .join("\n");
}
