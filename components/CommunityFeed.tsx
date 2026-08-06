"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useState } from "react";
import { usePlayerStore } from "@/lib/store";
import { DishLearnMore } from "./DishLearnMore";
import {
  authorById,
  dishById,
  feedPosts,
  dishes,
  type Dish,
} from "@/lib/fixtures/community";

/**
 * The community screen.
 *
 * Two rules hold this together, and both are the opposite of a normal social
 * feed:
 *
 *  1. There is no like button. The only interaction is "I ate this too", which
 *     is a real log that moves your own numbers. Engagement here has to cost
 *     something or it is just vanity.
 *
 *  2. The thing surfaced under each post is not applause, it is the honesty
 *     note — why this particular log was useful. Ranking on honesty is the only
 *     ranking that makes the estimates better.
 */

const CONF_STYLE: Record<Dish["confidence"], string> = {
  HIGH: "border-accent-green/50 bg-accent-green/15 text-accent-green",
  MEDIUM: "border-base-500 bg-base-800 text-ink-mid",
  LOW: "border-dashed border-base-500 bg-transparent text-ink-lo",
};

/**
 * The signature element: the estimate range drawn to scale, with the span a
 * solo logger would have had ghosted behind it. When community data genuinely
 * helps, you can see the interval shrink. When it cannot help, the two bars are
 * identical — and that honesty is the point.
 */
function RangeStrip({ dish }: { dish: Dish }) {
  // A fixed 0–1500 kcal axis so every dish is comparable at a glance.
  const AXIS = 1500;
  const pct = (v: number) => Math.min(100, (v / AXIS) * 100);
  const left = pct(dish.kcalRange[0]);
  const width = Math.max(2, pct(dish.kcalRange[1]) - left);

  // What the same dish would have looked like with no community sample: the
  // observed spread, widened. This is illustrative of the mechanic, not a
  // second measurement.
  const soloPad = dish.reducibility === "reducible" ? 0.55 : 0;
  const span = dish.kcalRange[1] - dish.kcalRange[0];
  const soloLeft = pct(Math.max(0, dish.kcalRange[0] - span * soloPad));
  const soloWidth = Math.max(2, pct(Math.min(AXIS, dish.kcalRange[1] + span * soloPad)) - soloLeft);

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
          Community estimate
        </span>
        <span className="font-mono text-[11px] tabular-nums text-ink-mid">
          {dish.kcalRange[0]}–{dish.kcalRange[1]} kcal
        </span>
      </div>

      <div className="relative mt-2 h-6 overflow-hidden rounded-md border border-base-700 bg-base-800/60">
        {soloPad > 0 ? (
          <div
            className="absolute inset-y-0 rounded-sm border border-dashed border-base-500/70"
            style={{ left: `${soloLeft}%`, width: `${soloWidth}%` }}
            aria-hidden="true"
          />
        ) : null}
        <motion.div
          initial={{ opacity: 0, scaleX: 0.4 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={{ left: `${left}%`, width: `${width}%`, transformOrigin: "left" }}
          className={`absolute inset-y-[3px] rounded-sm ${
            dish.confidence === "LOW"
              ? "bg-base-500/60"
              : dish.confidence === "MEDIUM"
                ? "bg-accent-green/45"
                : "bg-accent-green/80"
          }`}
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-lo">
        {soloPad > 0 ? (
          <>
            <span className="text-ink-mid">Dashed</span> is where a single log would
            have left it. {dish.logCount} logs closed it to the solid band.
          </>
        ) : (
          <>
            More logs will not narrow this one — the variance is in your portion,
            not the dish.
          </>
        )}
      </p>
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-base-600 bg-base-800 font-mono text-[11px] font-semibold text-ink-mid"
    >
      {initials}
    </span>
  );
}

function AteThisButton({ dish }: { dish: Dish }) {
  const logFromFeed = usePlayerStore((s) => s.logFromFeed);
  const alreadyLogged = usePlayerStore((s) => s.feedLogged.includes(dish.id));
  const busy = usePlayerStore((s) => s.thinking);
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      disabled={alreadyLogged || busy || pressed}
      onClick={() => {
        setPressed(true);
        void logFromFeed(dish.id);
      }}
      className={`mt-3 w-full rounded-full px-4 py-2.5 text-[13px] font-semibold transition ${
        alreadyLogged
          ? "cursor-default border border-accent-green/40 bg-accent-green/10 text-accent-green"
          : "bg-accent-green text-base-950 hover:brightness-110 disabled:opacity-60"
      }`}
    >
      {alreadyLogged ? "Logged to your day" : "I ate this too"}
    </button>
  );
}

export function CommunityFeed() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-base-700 bg-base-900/80 px-4 py-3">
        <p className="text-[13px] leading-relaxed text-ink-mid">
          Every log here tightens the estimate for everyone. There is no like
          button — the only thing you can do with a post is log it, and that
          moves your own numbers.
        </p>
      </div>

      {/* The board: which dishes most need logs. This is the part that makes
          contributing feel like it does something measurable. */}
      <section className="border-b border-base-700 px-4 py-4">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-lo">
          Widest ranges · most worth logging
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {[...dishes]
            .filter((d) => d.reducibility === "reducible")
            .sort(
              (a, b) =>
                (b.kcalRange[1] - b.kcalRange[0]) / b.kcalMedian -
                (a.kcalRange[1] - a.kcalRange[0]) / a.kcalMedian,
            )
            .slice(0, 3)
            .map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-base-700 bg-base-800/50 px-3 py-2"
              >
                <span className="truncate text-[13px] text-ink-hi">{d.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-ink-lo">
                    ±{Math.round((d.kcalRange[1] - d.kcalRange[0]) / 2)}
                  </span>
                  <span className="font-mono text-[10px] text-ink-lo">
                    {d.logCount} logs
                  </span>
                </span>
              </li>
            ))}
        </ul>
      </section>

      <ul className="flex flex-col">
        {feedPosts.map((post, i) => {
          const dish = dishById(post.dishId);
          const author = authorById(post.authorId);
          return (
            <motion.li
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.3 }}
              className="border-b border-base-700 px-4 py-4"
            >
              <div className="flex items-center gap-2.5">
                <Avatar initials={author.initials} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-semibold text-ink-hi">
                      {author.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-lo">
                      {post.time}
                    </span>
                  </div>
                  {/* Consistency, framed so a missed day is not a failure. */}
                  <div className="font-mono text-[10px] text-ink-lo">
                    {author.city} · logged {author.loggedDays} of last {author.ofDays} days
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${CONF_STYLE[dish.confidence]}`}
                >
                  {dish.confidence}
                </span>
              </div>

              <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl border border-base-700 bg-base-800">
                <Image
                  src={dish.image}
                  alt={`${dish.name} logged by ${author.name}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 420px"
                  className="object-cover"
                />
                {dish.trips ? (
                  <span className="absolute left-2 top-2 rounded-full border border-accent-red/50 bg-base-950/85 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-red">
                    Trips a rule of yours
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-[14px] leading-relaxed text-ink-hi">{post.caption}</p>

              <RangeStrip dish={dish} />

              <DishLearnMore dish={dish} />

              {/* Honesty, not applause. This is what the feed rewards. */}
              {post.honestyNote ? (
                <div className="mt-3 rounded-lg border-l-2 border-accent-green/50 bg-accent-green/[0.07] py-2 pl-3 pr-2">
                  <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-green">
                    Why this log is useful
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-mid">
                    {post.honestyNote}
                  </p>
                </div>
              ) : null}

              <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-lo">
                {post.alsoAte} people logged this too
              </div>

              <AteThisButton dish={dish} />
            </motion.li>
          );
        })}
      </ul>

      <p className="px-4 py-5 text-[11px] leading-relaxed text-ink-lo">
        Sample community data for the demo. The mechanic is real: estimate width
        is a function of how many people logged the same dish, and dishes whose
        variance is in your own portion are marked as such rather than being
        quietly averaged.
      </p>
    </div>
  );
}
