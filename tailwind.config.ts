import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#070B16",
          900: "#0A0F1E",
          850: "#0E1425",
          800: "#131B2F",
          700: "#1A2440",
          600: "#243052",
          500: "#33436C",
        },
        accent: {
          /** the one brand accent: 10.4:1 on base-850 */
          green: "#3DDC97",
          /**
           * Reserved for the medical never-suspends card only.
           * Lifted from #E5484D (4.68:1) to 7.3:1 on base-850 — the safety rule
           * is the one thing in the product that must never be hard to read.
           */
          red: "#FF7B72",
        },
        ink: {
          hi: "#F2F6FC",
          mid: "#C7D1E2",
          lo: "#98A5BC",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 10px 34px -14px rgba(0,0,0,0.65)",
        glow: "0 0 0 1px rgba(61,220,151,0.35), 0 0 28px -8px rgba(61,220,151,0.4)",
      },
      keyframes: {
        blink: {
          "0%, 80%, 100%": { opacity: "0.2" },
          "40%": { opacity: "1" },
        },
      },
      animation: {
        blink: "blink 1.4s infinite ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
