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
]);

/**
 * Fields that answer "where did this come from?".
 *
 * `weighed` counts because in this codebase it is the barcode gate's provenance
 * flag; `basis` counts because the WHOOP planner uses it to name its inputs.
 */
const PROVENANCE_FIELDS = new Set([
  "estimated",
  "confidence",
  "source",
  "weighed",
  "measured",
  "provenance",
  "basis",
  "range",
  "low",
  "high",
]);

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

  function walk(node: unknown, path: string, ignored: boolean): void {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, ignored));
      return;
    }
    if (!isPlainObject(node)) return;

    // Cycles: a payload built from live objects can self-reference.
    if (seen.has(node)) return;
    seen.add(node);

    const keys = Object.keys(node);
    const hasProvenance = keys.some((k) => PROVENANCE_FIELDS.has(k.toLowerCase()));

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

      walk(value, childPath, childIgnored);
    }
  }

  walk(input, "", false);
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
