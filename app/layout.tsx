import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HealthOS — a day in the loop",
  description:
    "An interactive replay of one disrupted day with HealthOS: adapt all day, honest uncertainty, save the day.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-base-950 antialiased">
        {children}
        <footer className="mx-auto max-w-6xl px-4 pb-6 pt-2 text-center text-[11px] text-ink-lo">
          Simulated demo — not medical advice. No accounts, no uploads, no
          health data leaves your browser.
        </footer>
      </body>
    </html>
  );
}
