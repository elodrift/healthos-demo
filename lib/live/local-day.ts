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
