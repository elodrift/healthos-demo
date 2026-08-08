"use client";

/**
 * Log a packaged food from its barcode.
 *
 * The whole point of this flow is that it produces the app's first non-guessed
 * food numbers — so the UI's job is to be precise about *which half* is known.
 * The label is measured. The portion is not, until the user says it is.
 *
 * Hence the two-step shape: a scan never yields a loggable meal on its own. It
 * yields a label, and then asks how much. Prefilling a portion the manufacturer
 * suggested and calling the result measured would be exactly the laundering this
 * codebase exists to prevent.
 *
 * The grams field is a plain text input rather than a scanner. A camera-based
 * scanner is the obvious next step, but typing the digits under the barcode
 * works on every device and has no failure mode to explain.
 */

import { useState } from "react";

import type { BarcodeLookup, LabelPer100g } from "@/lib/food/barcode";
import { scaleToGrams } from "@/lib/food/barcode";

type Found = Extract<BarcodeLookup, { kind: "found" }>;

export function BarcodeEntry({ onLogged }: { onLogged: () => void }) {
  const [code, setCode] = useState("");
  const [looking, setLooking] = useState(false);
  const [label, setLabel] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Grams of the product actually eaten. Starts blank even when the packet
  // publishes a serving size: a prefilled number gets accepted unread, and the
  // difference between "the packet says 15g" and "I weighed 15g" is the entire
  // basis of the `estimated` flag.
  const [grams, setGrams] = useState("");
  const [weighed, setWeighed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function lookup() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLooking(true);
    setError(null);
    setLabel(null);
    setGrams("");
    setWeighed(false);
    try {
      const res = await fetch(`/api/barcode?code=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "That barcode could not be looked up.");
        return;
      }
      setLabel((await res.json()) as Found);
    } catch {
      setError("The lookup failed. Check your connection and try again.");
    } finally {
      setLooking(false);
    }
  }

  async function log(found: Found, per100g: LabelPer100g, g: number) {
    setSaving(true);
    setError(null);
    try {
      const macros = scaleToGrams(per100g, g);
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: `${found.brand ? `${found.brand} ` : ""}${found.name} (${g}g)`,
          ...macros,
          /*
            HIGH only when the quantity is known too. The label's precision does
            not transfer to a portion the user eyeballed, so an unweighed scan
            is logged at MEDIUM — better than a photo guess, short of a fact.
          */
          confidence: weighed ? "HIGH" : "MEDIUM",
          source: "barcode",
          weighed,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "That meal could not be saved.");
        return;
      }
      setLabel(null);
      setCode("");
      setGrams("");
      setWeighed(false);
      onLogged();
    } catch {
      setError("Saving failed. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const gramsNum = Number(grams);
  const gramsValid = /^\d{1,4}$/.test(grams.trim()) && gramsNum > 0 && gramsNum <= 3000;
  const preview = label && gramsValid ? scaleToGrams(label.per100g, gramsNum) : null;

  return (
    <section className="rounded-2xl border border-base-700 bg-base-850 p-4 shadow-card">
      <h2 className="text-[15px] font-semibold tracking-tight text-ink-hi">
        Scan a packet
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-lo">
        Type the digits under the barcode. The label comes from the manufacturer, so the
        composition is read rather than guessed — you supply the amount.
      </p>

      <div className="mt-3 flex gap-2">
        <label htmlFor="barcode" className="sr-only">
          Barcode digits
        </label>
        <input
          id="barcode"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={code}
          maxLength={14}
          placeholder="3017620422003"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            // CJK IMEs fire Enter to confirm composition; 229 is Safari's
            // unreliable final composition event.
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void lookup();
            }
          }}
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-base-600 bg-base-900 px-3 font-mono text-[14px] text-ink-hi placeholder:text-ink-lo focus:border-accent-green focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void lookup()}
          disabled={looking || !code.trim()}
          className="min-h-[44px] shrink-0 rounded-lg border border-base-600 px-3 text-[14px] font-semibold text-ink-hi disabled:opacity-40"
        >
          {looking ? "Looking…" : "Look up"}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-base-600 bg-base-900 p-2.5 text-[12px] leading-relaxed text-ink-mid"
        >
          {error}
        </p>
      ) : null}

      {label ? (
        <div className="mt-3 rounded-xl border border-base-700 bg-base-900 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="min-w-0 truncate text-[14px] font-medium text-ink-hi">
              {label.brand ? `${label.brand} — ` : ""}
              {label.name}
            </h3>
            {/*
              The provenance badge. This is the only place in the app a food
              number gets to claim it was read off a label, so the wording is
              narrow: the composition is measured, not the meal.
            */}
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-accent-green">
              label
            </span>
          </div>

          <p className="mt-1.5 font-mono text-[11px] text-ink-lo">
            Per 100g: {label.per100g.kcal} kcal · {label.per100g.proteinG}p ·{" "}
            {label.per100g.carbG}c · {label.per100g.fatG}f
          </p>

          {/*
            The portion basis, stated plainly. UNKNOWN is the common case — most
            products publish no serving size at all — and saying so is what stops
            the user assuming the app knows a portion it does not.
          */}
          <p className="mt-2 text-[12px] leading-relaxed text-ink-mid">
            {label.portionBasis === "MANUFACTURER"
              ? `The packet calls one serving ${label.servingLabel ?? `${label.servingG}g`}. That is their typical portion, not yours.`
              : "The packet publishes no serving size, so there is no portion to suggest."}
          </p>

          <div className="mt-3 flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="grams" className="text-[13px] font-medium text-ink-hi">
                How much did you eat
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="grams"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={grams}
                  placeholder={label.servingG ? String(label.servingG) : "100"}
                  onChange={(e) => setGrams(e.target.value)}
                  className="min-h-[44px] w-full rounded-lg border border-base-600 bg-base-850 px-2.5 font-mono text-[14px] text-ink-hi placeholder:text-ink-lo focus:border-accent-green focus:outline-none"
                />
                <span className="font-mono text-[13px] text-ink-lo">g</span>
              </div>
            </div>
          </div>

          {label.servingG ? (
            <button
              type="button"
              onClick={() => setGrams(String(label.servingG))}
              className="mt-2 text-[12px] font-medium text-accent-green underline underline-offset-2"
            >
              Use one serving ({label.servingG}g)
            </button>
          ) : null}

          {/*
            The claim that flips `estimated` to false. Off by default and never
            inferred from the scan: the composition being measured says nothing
            about whether the quantity was.
          */}
          <label className="mt-3 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={weighed}
              onChange={(e) => setWeighed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-accent-green"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink-hi">
                I weighed this
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-lo">
                Only tick this for a scale reading. It is what lets the day count this as
                measured intake instead of an estimate.
              </span>
            </span>
          </label>

          {preview ? (
            <p className="mt-3 border-t border-base-700 pt-2.5 font-mono text-[12px] text-ink-hi">
              {gramsNum}g → {preview.kcal} kcal · {preview.proteinG}p · {preview.carbG}c ·{" "}
              {preview.fatG}f
            </p>
          ) : null}

          <button
            type="button"
            disabled={!gramsValid || saving}
            onClick={() => void log(label, label.per100g, gramsNum)}
            className="mt-3 min-h-[44px] w-full rounded-lg bg-accent-green text-[14px] font-semibold text-base-950 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Log this"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
