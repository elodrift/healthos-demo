import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "HealthOS — your health, orchestrated",
  // Not "play one simulated day" — the scripted demo it referred to has been
  // deleted, and this is the text that shows up in link previews and search.
  description:
    "Nutrition and training that adapt to your own recovery and sleep the moment life changes — honest about uncertainty, and never inventing a number.",
};

export const viewport: Viewport = {
  themeColor: "#0A0F1E",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`bg-base-950 ${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-base-950 font-sans text-ink-hi antialiased">{children}</body>
    </html>
  );
}
