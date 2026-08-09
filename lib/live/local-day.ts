/**
 * The calendar day an instant falls on *in a given zone*.
 *
 * A meal belongs to the day the person ate it, not the day it was on the
 * server. Bangkok is UTC+7, so an 8pm dinner there is already tomorrow in UTC —
 * deriving the day from the server clock would file it against the wrong day's
 * targets and silently corrupt both days' totals.
 *
 * Returns null for an unrecognised zone rather than falling back to UTC. A
 * silent fallback is how a meal ends up on the wrong day with nothing to show
 * that it happened.
 */
export function localDay(instant: Date, timeZone: string): string | null {
  try {
    // en-CA gives ISO order (YYYY-MM-DD), which is what a Postgres `date` wants.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return null;
  }
}

/**
 * The inverse: a naive wall-clock string ("YYYY-MM-DDTHH:MM") read *in* a zone,
 * returning the instant it denotes.
 *
 * Needed because a photo's EXIF capture time has no zone — it is the wall clock
 * the camera saw. To store it as a `timestamp` we have to pick an offset, and
 * the only defensible choice is the user's own zone.
 *
 * Two passes, because the offset depends on the instant we are trying to find.
 * The first pass treats the wall clock as if it were UTC to get a probe instant,
 * measures the zone's actual offset there, and corrects. The second pass repeats
 * the measurement at the corrected instant, which matters within an hour of a
 * DST boundary where the first probe can land on the wrong side.
 *
 * Returns null for an unrecognised zone or unparseable input — never a silent
 * UTC fallback, which is how a meal ends up hours off with nothing to show it.
 */
export function instantFromWallClock(wallClock: string, timeZone: string): Date | null {
  const m = wallClock.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;

  const [, y, mo, d, h, mi] = m;
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  if (Number.isNaN(asUtc)) return null;

  try {
    let instant = asUtc;
    for (let pass = 0; pass < 2; pass++) {
      const offset = zoneOffsetMs(new Date(instant), timeZone);
      if (offset === null) return null;
      instant = asUtc - offset;
    }
    return new Date(instant);
  } catch {
    return null;
  }
}

/**
 * How far ahead of UTC a zone is at a given instant, in milliseconds.
 *
 * Derived by formatting the instant in the target zone and reading the result
 * back as if it were UTC; the difference is the offset. This avoids hardcoding
 * any DST table and stays correct as zones change their rules.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant);

    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    // Intl renders midnight as hour 24 in some ICU versions; normalise it.
    const hour = get("hour") === 24 ? 0 : get("hour");

    const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
    if (Number.isNaN(asIfUtc)) return null;

    // Round to the minute: formatToParts drops sub-second precision, so the
    // raw difference carries the instant's own milliseconds as noise.
    return Math.round((asIfUtc - instant.getTime()) / 60_000) * 60_000;
  } catch {
    return null;
  }
}
