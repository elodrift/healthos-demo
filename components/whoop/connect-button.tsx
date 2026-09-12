"use client";

import { useEffect, useState } from "react";

/**
 * Starts the WHOOP OAuth flow, breaking out of the preview iframe when needed.
 *
 * Why this is not a plain `<a href>`: WHOOP's login page (`id.whoop.com`) sends
 * `x-frame-options: SAMEORIGIN`, verified on the wire. A same-frame navigation
 * inside the v0 preview therefore renders *nothing* — the browser refuses to
 * display it and the user sees a blank or unchanged panel with no error anywhere.
 * That is the "can't connect WHOOP anymore" symptom, and it is a hard refusal by
 * WHOOP, not something the app can style around.
 *
 * So when framed, open the flow in a top-level tab, where WHOOP will render and
 * where the session and state cookies belong to the top-level site.
 *
 * The iframe check runs in an effect rather than during render because
 * `window.self !== window.top` is unavailable on the server, and reading it
 * during render would make the first client paint disagree with the server HTML.
 * Until it resolves the button behaves as an ordinary link, which is the correct
 * behaviour in the common case of not being framed.
 */
export function ConnectWhoopButton({
  connected,
  disabled,
}: {
  connected: boolean;
  disabled: boolean;
}) {
  const [framed, setFramed] = useState(false);

  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      // A cross-origin frame can throw on the comparison. Throwing at all means
      // we are framed, so treat it as such.
      setFramed(true);
    }
  }, []);

  const label = connected ? "Reconnect WHOOP" : "Connect WHOOP";

  return (
    <>
      <a
        href={disabled ? undefined : "/api/whoop/connect"}
        aria-disabled={disabled}
        /*
          `target`/`rel` only when framed. Always opening a new tab would be
          worse in a normal browser tab: it orphans the flow from the page the
          user is reading and some browsers block it as a popup.
        */
        target={framed ? "_blank" : undefined}
        rel={framed ? "noopener noreferrer" : undefined}
        className={
          "mt-5 flex min-h-[44px] w-full items-center justify-center rounded-lg px-4 text-[15px] font-semibold transition-opacity " +
          (disabled
            ? "pointer-events-none bg-base-700 text-ink-lo"
            : "bg-accent-green text-base-950")
        }
      >
        {label}
        {framed && !disabled ? (
          <span className="ml-2 font-mono text-[11px] font-normal opacity-70">
            opens new tab
          </span>
        ) : null}
      </a>

      {/*
        State the reason, only when it applies.

        Without this the new tab is a surprise, and a surprise in an auth flow
        reads as something having gone wrong. Naming WHOOP as the constraint also
        stops it looking like an app bug.
      */}
      {framed && !disabled ? (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-lo">
          WHOOP&apos;s login refuses to load inside an embedded preview, so it
          opens in a new tab. Return here afterwards — this page will show the
          connection once it completes.
        </p>
      ) : null}
    </>
  );
}
