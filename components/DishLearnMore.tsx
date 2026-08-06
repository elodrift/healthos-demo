"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useState } from "react";
import { tightestVenue, venueGain, type Dish, type Venue } from "@/lib/fixtures/community";

/**
 * The educational layer, collapsed by default.
 *
 * Two deliberate choices:
 *
 *  1. Variance leads, dish background follows. Knowing that pad thai is noodles
 *     and tamarind is trivia; knowing the range is wide because of how much oil
 *     a wok holds is what makes your next log better. The order encodes that.
 *
 *  2. It starts closed. Inside a 390px phone, permanently-expanded teaching
 *     would push the actual feed off screen — education people have to scroll
 *     past is not education, it is furniture.
 */

/**
 * Venue ranges, drawn on a shared axis so the comparison is visual.
 *
 * This is the honest answer to "put my friends' spots on a map". A map shows
 * where people went; this shows what knowing where they went is worth. A fixed
 * kitchen has a narrower range than the unnamed bucket, so naming your venue is
 * a real accuracy lever — and when it is not (portion-driven dishes), the bars
 * come out identical and the copy says so.
 */
function VenueRanges({ dish }: { dish: Dish }) {
  const venues = dish.venues;
  if (!venues || venues.length === 0) return null;

  // A local axis, padded, so low-calorie dishes are as legible as high ones.
  const lo = Math.min(...venues.map((v) => v.kcalRange[0]));
  const hi = Math.max(...venues.map((v) => v.kcalRange[1]));
  const pad = (hi - lo) * 0.08 || 10;
  const axisLo = lo - pad;
  const axisHi = hi + pad;
  const pct = (v: number) => ((v - axisLo) / (axisHi - axisLo)) * 100;

  const gain = venueGain(dish);
  const best = tightestVenue(dish);

  const row = (v: Venue) => {
    const left = pct(v.kcalRange[0]);
    const width = Math.max(3, pct(v.kcalRange[1]) - left);
    const isBest = best?.name === v.name;

    return (
      <li key={v.name} className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`truncate text-[12px] ${v.generic ? "text-ink-lo" : "text-ink-hi"}`}
          >
            {v.name}
            <span className="ml-1.5 font-mono text-[10px] text-ink-lo">{v.area}</span>
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-ink-lo">
            {v.kcalRange[0]}–{v.kcalRange[1]} · {v.logCount}
          </span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-base-800">
          <motion.div
            initial={{ opacity: 0, scaleX: 0.5 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ left: `${left}%`, width: `${width}%`, transformOrigin: "left" }}
            className={`absolute inset-y-0 rounded-full ${
              v.generic
                ? "bg-base-600"
                : isBest
                  ? "bg-accent-green/80"
                  : "bg-accent-green/45"
            }`}
          />
        </div>
      </li>
    );
  };

  return (
    <div>
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-lo">
        Where it was logged
      </div>
      <ul className="mt-2 flex flex-col gap-2">{venues.map(row)}</ul>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-lo">
        {gain ? (
          <>
            Naming the place is worth about{" "}
            <span className="text-ink-mid">{gain}% off the range</span> — a fixed
            kitchen repeats itself in a way the unnamed bucket cannot.
          </>
        ) : (
          <>
            Same width at every venue. Naming the place would not help here,
            because the variance is in your portion rather than the kitchen.
          </>
        )}
      </p>
    </div>
  );
}

export function DishLearnMore({ dish }: { dish: Dish }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-1.5 rounded-md py-1 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mid transition hover:text-ink-hi"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          <path
            d="M4 2.5 L8 6 L4 9.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {open ? "Hide the detail" : "What moves this number"}
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-3 rounded-lg border border-base-700 bg-base-850/60 p-3">
              {/* Variance first — this is the part that improves the next log. */}
              <div>
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-lo">
                  Why the range is this wide
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
                  {dish.varianceNote}
                </p>
              </div>

              <VenueRanges dish={dish} />

              {/* Dish background second: useful context, not the point. */}
              <div>
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-lo">
                  What the dish is
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
                  {dish.background}
                </p>
              </div>

              <div className="rounded-md border-l-2 border-accent-green/50 bg-accent-green/[0.07] py-2 pl-3 pr-2">
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-green">
                  Log it better next time
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
                  {dish.logTip}
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
