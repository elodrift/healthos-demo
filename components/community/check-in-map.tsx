"use client";

/**
 * The Block 6 check-in map.
 *
 * Leaflet is loaded lazily inside an effect rather than imported at module
 * scope, because it touches `window` on import and would break server
 * rendering. `next/dynamic` with `ssr: false` is the usual answer, but this
 * component also needs to render a meaningful empty state *before* the library
 * arrives, so the load is explicit.
 *
 * The map only ever draws coordinates that were actually measured. Nothing here
 * geocodes a place name into a position — see `createCheckIn` for why that is a
 * deliberate refusal rather than an omission.
 */

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";

export type MapPin = {
  id: number;
  placeName: string;
  lat: number;
  lon: number;
  /** Whose pin this is — null for the viewer's own. */
  friendName: string | null;
};

type LeafletParts = {
  MapContainer: typeof import("react-leaflet").MapContainer;
  TileLayer: typeof import("react-leaflet").TileLayer;
  CircleMarker: typeof import("react-leaflet").CircleMarker;
  Tooltip: typeof import("react-leaflet").Tooltip;
};

type Props = {
  pins: MapPin[];
  /** Places that exist but have no measured position, so cannot be drawn. */
  unpinnedCount: number;
};

export function CheckInMap({ pins, unpinnedCount }: Props) {
  const [parts, setParts] = useState<LeafletParts | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    import("react-leaflet")
      .then((rl) => {
        if (!alive) return;
        setParts({
          MapContainer: rl.MapContainer,
          TileLayer: rl.TileLayer,
          CircleMarker: rl.CircleMarker,
          Tooltip: rl.Tooltip,
        });
      })
      .catch(() => {
        // Surfaced rather than swallowed: a blank rectangle where a map should be
        // reads as "you have no check-ins", which is a different claim.
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const caption =
    unpinnedCount > 0 ? (
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
        {unpinnedCount} {unpinnedCount === 1 ? "place has" : "places have"} no saved location
      </p>
    ) : null;

  if (pins.length === 0) {
    return (
      <div>
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-base-700 bg-base-900">
          <p className="max-w-xs px-6 text-center text-sm leading-relaxed text-ink-lo">
            No mapped places yet. Add a check-in with
            <span className="text-ink-hi"> Use my location</span> and it appears here.
          </p>
        </div>
        {caption}
      </div>
    );
  }

  if (failed) {
    return (
      <div>
        <div className="flex h-64 items-center justify-center rounded-lg border border-base-700 bg-base-900">
          <p className="max-w-xs px-6 text-center text-sm leading-relaxed text-ink-lo">
            The map could not load. Your {pins.length}{" "}
            {pins.length === 1 ? "place is" : "places are"} listed below.
          </p>
        </div>
        {caption}
      </div>
    );
  }

  if (!parts) {
    return (
      <div>
        <div
          className="h-64 animate-pulse rounded-lg border border-base-700 bg-base-900"
          aria-label="Loading map"
        />
        {caption}
      </div>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Tooltip } = parts;

  // Centre on the mean of real pins. With one pin that is the pin itself; with
  // several it keeps them all roughly in frame without pretending to a bounding
  // box we have not computed.
  const center: [number, number] = [
    pins.reduce((s, p) => s + p.lat, 0) / pins.length,
    pins.reduce((s, p) => s + p.lon, 0) / pins.length,
  ];

  return (
    <div>
      <div className="h-64 overflow-hidden rounded-lg border border-base-700">
        <MapContainer
          center={center}
          zoom={pins.length === 1 ? 14 : 11}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%", background: "#0d0f12" }}
        >
          <TileLayer
            // CARTO dark basemap, to sit with the rest of the interface rather
            // than dropping a bright OSM tile into a dark surface.
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {pins.map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lon]}
              radius={6}
              pathOptions={{
                // The viewer's own places read as the accent; friends' places are
                // muted, so ownership is legible without a legend.
                color: p.friendName ? "#6b7280" : "#22c55e",
                fillColor: p.friendName ? "#6b7280" : "#22c55e",
                fillOpacity: 0.7,
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <span className="font-mono text-[11px]">
                  {p.placeName}
                  {p.friendName ? ` · ${p.friendName}` : ""}
                </span>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      {caption}
    </div>
  );
}
