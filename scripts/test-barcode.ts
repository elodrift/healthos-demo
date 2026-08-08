/**
 * Barcode lookup, against the real Open Food Facts API.
 *
 * Deliberately not mocked. The bug this guards against is not "does the parser
 * handle a fixture" — it is "does a real product still arrive with the fields we
 * assume", which a fixture can never answer because it freezes the API's shape
 * at the moment it was written. This is the same lesson as the live-owner probe:
 * a passing test that supplies its own inputs proves the engine, not the feed.
 *
 * Nutella (3017620422003) is load-bearing here. It publishes full per-100g
 * macros and *no serving size at all*, which is the exact case that must resolve
 * to portionBasis UNKNOWN. If OFF ever adds a serving size to it, this test
 * starts failing and the fixture-free choice pays for itself: it will be telling
 * the truth about the API, not about our snapshot of it.
 *
 * Network-dependent, so it is not in `verify`. Run with `npm run test:barcode`.
 */

import { lookupBarcode, normalizeBarcode, scaleToGrams } from "../lib/food/barcode";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

async function main() {
  /* --- local shape validation, no network ------------------------------- */
  check("normalize strips spaces and dashes", normalizeBarcode(" 301-762 0422003 ") === "3017620422003");
  check("normalize rejects letters", normalizeBarcode("30176204abc") === null);
  check("normalize rejects too short", normalizeBarcode("1234567") === null);
  check("normalize rejects too long", normalizeBarcode("123456789012345") === null);

  /* --- scaling arithmetic ----------------------------------------------- */
  const per100 = { kcal: 539, proteinG: 6.3, carbG: 57.5, fatG: 30.9 };
  const at15 = scaleToGrams(per100, 15);
  check("15g of Nutella is 81 kcal", at15.kcal === 81, `got ${at15.kcal}`);
  check(
    "protein rounds to whole grams",
    at15.proteinG === 1 && Number.isInteger(at15.proteinG),
    `got ${at15.proteinG}`,
  );
  const at100 = scaleToGrams(per100, 100);
  check("100g is the label unchanged", at100.kcal === 539 && at100.carbG === 58, JSON.stringify(at100));

  /* --- a product with macros but NO serving size ------------------------ */
  const nutella = await lookupBarcode("3017620422003");
  check("Nutella resolves", nutella.kind === "found", nutella.kind);
  if (nutella.kind === "found") {
    check("Nutella has a name", nutella.name.length > 0, nutella.name);
    check("brand is a single brand, not the OFF list", !nutella.brand?.includes(","), String(nutella.brand));
    check("kcal arrived non-null", nutella.per100g.kcal > 0, String(nutella.per100g.kcal));
    check("protein arrived non-null", nutella.per100g.proteinG > 0, String(nutella.per100g.proteinG));
    /*
      The assertion this file exists for. No published serving size must surface
      as UNKNOWN, never as a silent 100g default — a default here would let the
      UI prefill a portion and call the result measured.
    */
    check(
      "no serving size => portionBasis UNKNOWN and servingG null",
      nutella.portionBasis === "UNKNOWN" && nutella.servingG === null,
      `basis=${nutella.portionBasis} servingG=${nutella.servingG}`,
    );
  }

  /* --- a product WITH a serving size ------------------------------------ */
  const coke = await lookupBarcode("5449000000996");
  check("Coca-Cola resolves", coke.kind === "found", coke.kind);
  if (coke.kind === "found") {
    check(
      "published serving => MANUFACTURER basis, never MEASURED",
      coke.portionBasis === "MANUFACTURER",
      coke.portionBasis,
    );
    check("serving grams parsed", coke.servingG === 330, String(coke.servingG));
    check("serving label kept verbatim", (coke.servingLabel ?? "").includes("330"), String(coke.servingLabel));
  }

  /* --- unknown and malformed codes -------------------------------------- */
  const missing = await lookupBarcode("8712100849718");
  check("unknown barcode is not-found, not a crash", missing.kind === "not-found", missing.kind);

  const bad = await lookupBarcode("hello");
  check("non-numeric is invalid, distinct from not-found", bad.kind === "invalid", bad.kind);

  /*
    not-found and unavailable must stay separate: telling a user "no such
    product" when our own lookup timed out is a false statement about a third
    party, the same class of bug as the WHOOP outage banner.
  */
  check(
    "not-found and unavailable are distinct kinds",
    missing.kind !== "unavailable",
    "an outage must never be reported as a missing product",
  );

  console.log(
    failures === 0
      ? "\nAll barcode assertions passed (against the live Open Food Facts API).\n"
      : `\n${failures} assertion(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
