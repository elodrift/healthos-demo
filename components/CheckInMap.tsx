"use client";

/**
 * The check-in map — DNA Block 6.
 *
 * "Virtual activity map, friends see where you plan to go / went, momentum &
 * social accountability."
 *
 * Two decisions worth defending:
 *
 * 1. PLANNED PINS LEAD. A map of where people already ate is history, and
 *    history is what the per-venue ranges on each dish already deliver. The
 *    planned half is what earns the feature: a meal known in advance stops
 *    being scenario S1 (plan breaks with zero notice, widest possible estimate)
 *    and becomes something the engine can prepare for. So planned pins carry the
 *    brand accent, past pins are muted, and the list below the map puts plans
 *    first.
 *
 * 2. JOINING A PLAN LOGS NOTHING. Nothing has been eaten. The action produces a
 *    proposal (DNA §4.12) and the macro header must not move. The button copy
 *    says "Join — nothing logged" so the user is never surprised by what a tap
 *    did.
 *
 * Leaflet is DOM-only, so the map is loaded client-side and the tile layer is
 * given a muted dark filter to sit inside the product's palette rather than
 * dropping a bright consumer map into a dark phone.
 */

// Leaflet's stylesheet, imported statically so the bundler handles it. The
// library itself is still loaded lazily below because it touches window on
// import and would break server rendering.
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import {
  authorById,
  checkIns,
  dishById,
  mapCity,
  placeById,
  places,
  friendsElsewhere,
  type CheckIn,
} from "@/lib/fixtures/community";
import { usePlayerStore } from "@/lib/store";

/*
 * Leaflet takes raw colour strings, not Tailwind classes, so the two pin
 * colours are the literal token values from tailwind.config.ts.
 *
 * Deliberately NOT a new accent: the palette is one brand green plus a red
 * reserved exclusively for the medical never-suspends card. Introducing an amber
 * for "planned" would have been a fourth accent and would have diluted the one
 * signal in the product that must never compete for attention. Planned pins
 * carry the brand green; past pins recede to muted ink.
 */
const PIN_PLANNED = "#3DDC97"; // accent-green
const PIN_WENT = "#98A5BC"; // ink-lo

type LeafletMods = {
  MapContainer: typeof import("react-leaflet").MapContainer;
  TileLayer: typeof import("react-leaflet").TileLayer;
  CircleMarker: typeof import("react-leaflet").CircleMarker;
  Tooltip: typeof import("react-leaflet").Tooltip;
};

/** Planned first — the actionable ones. */
const ordered = [...checkIns].sort((a, b) =>
  a.status === b.status ? 0 : a.status === "planned" ? -1 : 1,
);

/**
 * Bounds computed from the pins rather than a hardcoded zoom. At 302px a fixed
 * zoom cropped the outermost pins, which is worse than it sounds: a check-in you
 * cannot see reads as a check-in that does not exist.
 */
const pinned = places.filter((p) => checkIns.some((c) => c.placeId === p.id));
const lats = pinned.map((p) => p.coords[0]);
const lngs = pinned.map((p) => p.coords[1]);
const PAD = 0.006;
const bounds: [[number, number], [number, number]] = [
  [Math.min(...lats) - PAD, Math.min(...lngs) - PAD],
  [Math.max(...lats) + PAD, Math.max(...lngs) + PAD],
];

export function CheckInMap() {
  const [mods, setMods] = useState<LeafletMods | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const joinPlan = usePlayerStore((s) => s.joinPlan);
  const joinedPlans = usePlayerStore((s) => s.joinedPlans);
  const thinking = usePlayerStore((s) => s.thinking);

  // Leaflet touches window/document on import, so it can only load in the
  // browser. Its stylesheet is injected the same way for the same reason.
  useEffect(() => {
    let alive = true;
    (async () => {
      const rl = await import("react-leaflet");
      if (!alive) return;
      setMods({
        MapContainer: rl.MapContainer,
        TileLayer: rl.TileLayer,
        CircleMarker: rl.CircleMarker,
        Tooltip: rl.Tooltip,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  const elsewhere = friendsElsewhere();

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-mid">
            Check-ins
          </h2>
          <span className="font-mono text-[10px] text-ink-lo">{mapCity.name}</span>
        </div>
        <p className="text-pretty text-[12px] leading-relaxed text-ink-mid">
          Where friends went, and where they are{" "}
          <span className="text-accent-green">going next</span>. The plans are the useful half — a
          meal I know about in advance is one I can hold room for.
        </p>
      </header>

      <div className="relative h-[168px] w-full overflow-hidden rounded-xl border border-base-700 bg-base-850">
        {mods ? (
          <mods.MapContainer
            bounds={bounds}
            zoomControl={false}
            attributionControl={false}
            scrollWheelZoom={false}
            className="h-full w-full bg-base-850"
          >
            {/*
             * Carto's dark basemap rather than default OSM: a bright street map
             * inside a dark phone reads as a foreign object, and the label
             * density of standard OSM is illegible at 302px wide.
             */}
            <mods.TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" />

            {places.map((place) => {
              const here = checkIns.filter((c) => c.placeId === place.id);
              if (here.length === 0) return null;
              const planned = here.some((c) => c.status === "planned");
              const isSel = here.some((c) => c.id === selected);

              return (
                <mods.CircleMarker
                  key={place.id}
                  center={place.coords}
                  radius={isSel ? 9 : 6}
                  pathOptions={{
                    // Planned pins carry the accent; past pins recede.
                    color: planned ? PIN_PLANNED : PIN_WENT,
                    fillColor: planned ? PIN_PLANNED : PIN_WENT,
                    fillOpacity: planned ? 0.75 : 0.35,
                    weight: isSel ? 3 : 1.5,
                  }}
                  eventHandlers={{
                    click: () => setSelected(here[0].id),
                  }}
                >
                  <mods.Tooltip direction="top" offset={[0, -6]} opacity={1}>
                    <span className="font-mono text-[10px]">{place.name}</span>
                  </mods.Tooltip>
                </mods.CircleMarker>
              );
            })}
          </mods.MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-lo">
              Loading map…
            </span>
          </div>
        )}
      </div>

      {/* Legend. Two states only — anything more is decoration. */}
      <div className="flex items-center gap-4 px-0.5">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent-green" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-mid">
            Planned
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ink-lo/50" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-lo">Went</span>
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {ordered.map((c) => (
          <CheckInRow
            key={c.id}
            checkIn={c}
            selected={selected === c.id}
            joined={joinedPlans.includes(c.id)}
            disabled={thinking}
            onSelect={() => setSelected(c.id)}
            onJoin={() => joinPlan(c.id)}
          />
        ))}
      </ul>

      {/*
       * Said plainly rather than hidden: the map only shows one city, and some
       * friends log from elsewhere. Silently dropping them would imply the
       * community is smaller and more local than it is.
       */}
      {elsewhere > 0 ? (
        <p className="px-0.5 text-[11px] leading-relaxed text-ink-lo">
          {elsewhere} {elsewhere === 1 ? "friend logs" : "friends log"} from other cities and{" "}
          {elsewhere === 1 ? "does" : "do"} not appear on this map.
        </p>
      ) : null}
    </div>
  );
}

function CheckInRow({
  checkIn,
  selected,
  joined,
  disabled,
  onSelect,
  onJoin,
}: {
  checkIn: CheckIn;
  selected: boolean;
  joined: boolean;
  disabled: boolean;
  onSelect: () => void;
  onJoin: () => void;
}) {
  const who = authorById(checkIn.authorId);
  const place = placeById(checkIn.placeId);
  const dish = dishById(checkIn.dishId);
  const planned = checkIn.status === "planned";

  return (
    <li
      className={`rounded-xl border px-2.5 py-2 transition ${
        selected ? "border-base-500 bg-base-850" : "border-base-700 bg-base-850/60"
      }`}
    >
      <button type="button" onClick={onSelect} className="flex w-full flex-col gap-1 text-left">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              planned ? "bg-accent-green" : "bg-ink-lo/50"
            }`}
          />
          <span className="truncate text-[12px] font-semibold text-ink-hi">{who.name}</span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-lo">
            {planned ? checkIn.time : `went · ${checkIn.time}`}
          </span>
        </span>
        <span className="truncate text-[11px] text-ink-mid">
          {dish.name} · {place.name}
        </span>
      </button>

      {planned ? (
        joined ? (
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-accent-green">
            Plan noted · nothing logged
          </p>
        ) : (
          <button
            type="button"
            onClick={onJoin}
            disabled={disabled}
            className="mt-1.5 w-full rounded-full border border-accent-green/40 bg-accent-green/10 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-green transition hover:bg-accent-green/20 disabled:opacity-40"
          >
            Join — nothing logged
          </button>
        )
      ) : null}
    </li>
  );
}
