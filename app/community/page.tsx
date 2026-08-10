import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getFriendCheckIns,
  getFriends,
  getOwnCheckIns,
} from "@/app/actions/community";
import { CheckInMap, type MapPin } from "@/components/community/check-in-map";
import { CheckInForm } from "@/components/community/check-in-form";
import { FriendsPanel } from "@/components/community/friends-panel";

export const metadata = {
  title: "Community · HealthOS",
  description: "Check-ins you chose to share, and the friends who can see them.",
};

/**
 * Block 6: the check-in map and the friend graph.
 *
 * Everything on this page is real. There are no seeded venues and no sample
 * friends — an account with no connections sees empty states that say so, which
 * is the point. The previous version of this surface shipped invented venues with
 * fabricated nutrition attached to real restaurant names, and was deleted for it.
 */
export default async function CommunityPage() {
  const session = await auth.api.getSession({ headers: headers() });
  if (!session?.user) redirect("/sign-in?next=/community");

  const [own, friendCheckIns, friends] = await Promise.all([
    getOwnCheckIns(),
    getFriendCheckIns(),
    getFriends(),
  ]);

  // Only rows with a measured position can be drawn; the rest are counted so the
  // map can admit what it is not showing instead of quietly dropping them.
  const pins: MapPin[] = [
    ...own
      .filter((c) => c.lat !== null && c.lon !== null)
      .map((c) => ({
        id: c.id,
        placeName: c.placeName,
        lat: c.lat as number,
        lon: c.lon as number,
        friendName: null,
      })),
    ...friendCheckIns
      .filter((c) => c.lat !== null && c.lon !== null)
      .map((c) => ({
        id: -c.id, // negated so a friend's row id cannot collide with one of ours
        placeName: c.placeName,
        lat: c.lat as number,
        lon: c.lon as number,
        friendName: c.friendName,
      })),
  ];

  const unpinnedCount =
    own.filter((c) => c.lat === null || c.lon === null).length +
    friendCheckIns.filter((c) => c.lat === null || c.lon === null).length;

  const sharedCount = own.filter((c) => c.sharedWithFriends).length;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 px-5 py-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-lg text-ink-hi">Community</h1>
          <p className="mt-1 text-xs leading-relaxed text-ink-lo">
            {sharedCount === 0
              ? "Nothing of yours is shared."
              : `${sharedCount} of your ${own.length} places ${sharedCount === 1 ? "is" : "are"} shared.`}
          </p>
        </div>
        <nav className="flex shrink-0 items-center gap-4">
          <Link
            href="/live"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo underline underline-offset-4 transition hover:text-accent-green"
          >
            Live
          </Link>
          <Link
            href="/chat"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo underline underline-offset-4 transition hover:text-accent-green"
          >
            Chat
          </Link>
        </nav>
      </header>

      <section aria-labelledby="map-heading" className="flex flex-col gap-3">
        <h2
          id="map-heading"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo"
        >
          Check-in map
        </h2>
        <CheckInMap pins={pins} unpinnedCount={unpinnedCount} />
      </section>

      <section aria-labelledby="add-heading" className="flex flex-col gap-3">
        <h2
          id="add-heading"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo"
        >
          Add a place
        </h2>
        <CheckInForm />
      </section>

      {own.length > 0 ? (
        <section aria-labelledby="yours-heading" className="flex flex-col gap-3">
          <h2
            id="yours-heading"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo"
          >
            Your places
          </h2>
          <ul className="flex flex-col divide-y divide-base-800">
            {own.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-hi">{c.placeName}</p>
                  <p className="font-mono text-[10px] text-ink-lo">
                    {c.plannedFor
                      ? `Planned ${c.plannedFor.toLocaleString()}`
                      : c.createdAt.toLocaleDateString()}
                    {c.lat === null ? " · no location" : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] ${
                    c.sharedWithFriends ? "text-accent-green" : "text-ink-lo"
                  }`}
                >
                  {c.sharedWithFriends ? "Shared" : "Private"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {friendCheckIns.length > 0 ? (
        <section aria-labelledby="friends-places-heading" className="flex flex-col gap-3">
          <h2
            id="friends-places-heading"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo"
          >
            Shared with you
          </h2>
          <ul className="flex flex-col divide-y divide-base-800">
            {friendCheckIns.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink-hi">{c.placeName}</p>
                  <p className="font-mono text-[10px] text-ink-lo">{c.friendName}</p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-ink-lo">
                  {c.plannedFor
                    ? c.plannedFor.toLocaleDateString()
                    : c.createdAt.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="friends-heading" className="flex flex-col gap-3">
        <h2
          id="friends-heading"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo"
        >
          Friends
        </h2>
        <FriendsPanel friends={friends} />
      </section>
    </main>
  );
}
