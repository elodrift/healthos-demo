"use client";

import { useState } from "react";
import {
  requestFriend,
  respondToFriend,
  type FriendFormState,
  type FriendRow,
} from "@/app/actions/community";

const INITIAL: FriendFormState = {};

/**
 * The friend graph, as a list plus an invite field.
 *
 * Incoming requests are the only rows with actions, because under "mutual accept
 * only" the addressee is the only person whose answer changes anything. An
 * outgoing request renders as plain text — there is nothing for the requester to
 * press, and a disabled Accept button would imply otherwise.
 */
export function FriendsPanel({ friends }: { friends: FriendRow[] }) {
  // Plain async submit rather than `useActionState`: this project is on React
  // 18.3.1, where that hook does not exist. See the note in check-in-form.tsx.
  const [state, setState] = useState<FriendFormState>(INITIAL);
  const [pending, setPending] = useState(false);
  /*
   * Tracks which specific request is being answered.
   *
   * A single boolean would disable every Accept/Decline button at once, which
   * reads as "the whole panel is broken" when only one row is in flight. React
   * 18's `startTransition` is not used here because it does not await an async
   * callback — the pending state would clear immediately while the write was
   * still going, so the buttons would re-enable and invite a double-accept.
   */
  const [respondingId, setRespondingId] = useState<number | null>(null);

  async function respond(id: number, accept: boolean) {
    setRespondingId(id);
    try {
      await respondToFriend(id, accept);
    } catch {
      setState({ error: "Could not update that request. Try again." });
    } finally {
      setRespondingId(null);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    try {
      const result = await requestFriend(INITIAL, new FormData(form));
      setState(result);
      if (result.ok) form.reset();
    } catch {
      setState({ error: "Could not send that request. Try again." });
    } finally {
      setPending(false);
    }
  }

  const incoming = friends.filter((f) => f.incoming);
  const accepted = friends.filter((f) => f.status === "accepted");
  const outgoing = friends.filter((f) => f.status === "pending" && !f.incoming);

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label
          htmlFor="friend-email"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo"
        >
          Connect by email
        </label>
        <div className="flex gap-2">
          <input
            id="friend-email"
            name="email"
            type="email"
            required
            placeholder="them@example.com"
            className="min-w-0 flex-1 rounded-md border border-base-700 bg-base-900 px-3 py-2 text-sm text-ink-hi placeholder:text-ink-lo focus:border-accent-green focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-base-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo transition hover:border-accent-green hover:text-accent-green disabled:opacity-50"
          >
            {pending ? "Sending…" : "Request"}
          </button>
        </div>
        {state.error ? (
          <p role="alert" className="text-xs text-red-400">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-xs text-ink-lo">{state.ok}</p> : null}
      </form>

      {incoming.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent-green">
            Wants to connect
          </h3>
          {incoming.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-md border border-base-700 bg-base-900 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-ink-hi">{f.name}</p>
                <p className="truncate font-mono text-[10px] text-ink-lo">{f.email}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={respondingId === f.id}
                  onClick={() => void respond(f.id, true)}
                  className="rounded bg-accent-green px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-base-950 transition hover:opacity-90 disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={respondingId === f.id}
                  onClick={() => void respond(f.id, false)}
                  className="rounded border border-base-700 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-lo transition hover:text-ink-hi disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
          Friends
        </h3>
        {accepted.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-lo">
            No connections yet. Both people have to accept before anything is visible.
          </p>
        ) : (
          accepted.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-md border border-base-800 px-3 py-2"
            >
              <p className="min-w-0 truncate text-sm text-ink-hi">{f.name}</p>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-accent-green">
                Connected
              </span>
            </div>
          ))
        )}
      </section>

      {outgoing.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-lo">
            Awaiting their answer
          </h3>
          {outgoing.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <p className="min-w-0 truncate text-sm text-ink-lo">{f.email}</p>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-lo">
                Pending
              </span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
