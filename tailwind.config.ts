import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#05070d",
          900: "#0a0f1a",
          850: "#0d1420",
          800: "#111a2b",
          700: "#182338",
          600: "#22304a",
          500: "#324567",
        },
        accent: {
          green: "#34d399",
          greendim: "#1f8f6c",
          amber: "#f5a524",
          red: "#f0554f",
          blue: "#4f8ef7",
        },
        ink: {
          hi: "#f4f7fb",
          mid: "#c3ccdb",
          lo: "#8b96ab",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 8px 30px -12px rgba(0,0,0,0.5)",
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
