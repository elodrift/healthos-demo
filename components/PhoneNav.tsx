"use client";

import { usePlayerStore, type PhoneScreen } from "@/lib/store";

/**
 * The product's own bottom navigation, inside the phone. Two screens only —
 * the day you are having, and the community. Anything more would be a product
 * org's org chart rendered as tabs.
 */
const SCREENS: Array<{ id: PhoneScreen; label: string }> = [
  { id: "today", label: "Today" },
  { id: "community", label: "Community" },
];

export function PhoneNav() {
  const phoneScreen = usePlayerStore((s) => s.phoneScreen);
  const setPhoneScreen = usePlayerStore((s) => s.setPhoneScreen);

  return (
    <nav
      aria-label="App sections"
      className="flex shrink-0 gap-1 border-t border-base-700 bg-base-900 px-1.5 py-1"
    >
      {SCREENS.map((screen) => {
        const active = phoneScreen === screen.id;
        return (
          <button
            key={screen.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => setPhoneScreen(screen.id)}
            className={`flex-1 rounded-full py-1.5 text-[11px] font-medium tracking-wide transition ${
              active
                ? "bg-accent-green/15 text-accent-green"
                : "text-ink-lo hover:text-ink-mid"
            }`}
          >
            {screen.label}
          </button>
        );
      })}
    </nav>
  );
}
