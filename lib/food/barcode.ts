/**
 * Barcode lookup against Open Food Facts.
 *
 * This is the first food number in the app that is not a guess. A vision model
 * looking at a plate infers both *what* the food is and *how much* of it there
 * is; a barcode resolves the first question against a manufacturer's published
 * label. That is a different epistemic class, and the app is built to care about
 * the difference.
 *
 * The distinction this module exists to preserve:
 *
 *   - The per-100g composition is MEASURED. It comes off the label.
 *   - The portion is usually NOT. Most products carry no serving size, and even
 *     when they do, "1 portion (330 ml)" is the manufacturer's suggestion, not
 *     an observation of what this person poured.
 *
 * So a lookup never returns a finished meal. It returns a label plus a *basis*
 * for the portion, and the caller must ask the user for grams before anything
 * reaches the database. Nutella is the case that proves the point: full macros,
 * no serving size at all. Reporting "539 kcal" as the meal would be precisely
 * the failure mode this codebase is written against — a real number attached to
 * a quantity nobody measured.
 *
 * No API key, no auth, and no user data leaves the app: the only thing sent is
 * the barcode. Open Food Facts asks for an identifying User-Agent, which is set
 * below.
 */

/** Per-100g composition as published on the label. */
export type LabelPer100g = {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
};

export type BarcodeLookup =
  | {
      kind: "found";
      barcode: string;
      name: string;
      brand: string | null;
      per100g: LabelPer100g;
      /**
       * Grams the manufacturer calls one serving, when published.
       *
       * `null` is the common case, and it is not a defect to paper over — it is
       * the reason `portionBasis` exists.
       */
      servingG: number | null;
      /** Verbatim serving text, e.g. "1 portion (330 ml)". Shown, never parsed. */
      servingLabel: string | null;
      /**
       * How the portion would be known if the user accepted the default.
       *
       * "MANUFACTURER" — a serving size is published, so a default exists but is
       * still the manufacturer's claim about a typical portion.
       * "UNKNOWN" — nothing published. The user must supply grams; there is
       * nothing to prefill and the UI must not invent one.
       */
      portionBasis: "MANUFACTURER" | "UNKNOWN";
    }
  | { kind: "not-found"; barcode: string }
  | { kind: "invalid"; reason: string }
  | { kind: "unavailable" };

/**
 * EAN-8/13, UPC-A/E and ITF-14 all land between 8 and 14 digits. Validating
 * shape locally avoids a pointless round trip for obvious typos, but the check
 * stays deliberately loose: rejecting a real barcode because it failed a
 * checksum we implemented ourselves would be worse than asking Open Food Facts.
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d{8,14}$/.test(digits)) return null;
  return digits;
}

const ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS = "product_name,brands,serving_size,serving_quantity,nutriments";

/**
 * Open Food Facts asks API users to identify themselves so they can contact
 * heavy consumers rather than blocking them.
 */
const USER_AGENT = "HealthOS/1.0 (https://github.com/elodrift/healthos-demo)";

/** A finite, non-negative number, or null. Rejects NaN, Infinity and strings. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export async function lookupBarcode(rawBarcode: string): Promise<BarcodeLookup> {
  const barcode = normalizeBarcode(rawBarcode);
  if (!barcode) {
    return { kind: "invalid", reason: "That doesn't look like a barcode." };
  }

  let payload: unknown;
  try {
    const res = await fetch(
      `${ENDPOINT}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
      {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        // Labels change rarely, so a day of caching is generous to a free
        // community API without ever showing a stale figure that matters.
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(8000),
      },
    );
    // 404 is a normal "no such product" answer here, not an outage.
    if (res.status === 404) return { kind: "not-found", barcode };
    if (!res.ok) return { kind: "unavailable" };
    payload = await res.json();
  } catch {
    // Timeout, DNS, offline. Distinct from not-found on purpose: the caller
    // tells the user the lookup failed rather than that the food does not exist.
    return { kind: "unavailable" };
  }

  const body = payload as {
    status?: number;
    product?: {
      product_name?: unknown;
      brands?: unknown;
      serving_size?: unknown;
      serving_quantity?: unknown;
      nutriments?: Record<string, unknown>;
    };
  };

  // status 0 is how v2 reports both "not found" and "invalid code".
  if (body.status === 0 || !body.product) return { kind: "not-found", barcode };

  const p = body.product;
  const n = p.nutriments ?? {};

  const kcal = num(n["energy-kcal_100g"]);
  const proteinG = num(n["proteins_100g"]);
  const carbG = num(n["carbohydrates_100g"]);
  const fatG = num(n["fat_100g"]);

  /*
    Energy and protein are the two figures this app actually plans against, so a
    product missing either is treated as not usable rather than filled with
    zeros. A silent 0g protein would flow into the day's remaining-protein
    arithmetic as though it were a measurement of nothing.

    Carbs and fat default to 0 only when energy and protein are both present,
    because a genuine zero is common there (still water, black coffee).
  */
  if (kcal === null || proteinG === null) return { kind: "not-found", barcode };

  const name = typeof p.product_name === "string" ? p.product_name.trim() : "";
  if (!name) return { kind: "not-found", barcode };

  const brandRaw = typeof p.brands === "string" ? p.brands.trim() : "";
  // OFF brands are a comma-joined crowd-sourced list ("Nutella, Ferrero, Yum
  // yum"). The first entry is the useful one; the rest is noise in a UI.
  const brand = brandRaw ? (brandRaw.split(",")[0]?.trim() || null) : null;

  const servingG = num(p.serving_quantity);
  const servingLabel =
    typeof p.serving_size === "string" && p.serving_size.trim()
      ? p.serving_size.trim()
      : null;

  return {
    kind: "found",
    barcode,
    name,
    brand,
    per100g: { kcal, proteinG, carbG: carbG ?? 0, fatG: fatG ?? 0 },
    servingG,
    servingLabel,
    portionBasis: servingG !== null ? "MANUFACTURER" : "UNKNOWN",
  };
}

/**
 * Scale a label to an actual weight.
 *
 * Rounded to whole grams and whole calories because the inputs are already
 * rounded on the packet: carrying 20.34g of protein would imply a precision the
 * label does not have.
 */
export function scaleToGrams(per100g: LabelPer100g, grams: number) {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    proteinG: Math.round(per100g.proteinG * f),
    carbG: Math.round(per100g.carbG * f),
    fatG: Math.round(per100g.fatG * f),
  };
}
