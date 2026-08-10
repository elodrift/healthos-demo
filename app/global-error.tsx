"use client";

/**
 * The last boundary. Catches errors thrown in the root layout itself, which
 * app/error.tsx cannot — it lives inside that layout.
 *
 * Because the root layout is what failed, this component has to render its own
 * <html> and <body>, and it cannot rely on the app's fonts, Tailwind layer or
 * theme tokens being available. Styles are therefore inline and deliberately
 * plain: this file's only job is to be a page that renders when nothing else does.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0d10",
          color: "#e6e8eb",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <main style={{ maxWidth: 380, padding: 24 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 12px" }}>
            HealthOS could not start.
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "#9aa3ad", margin: "0 0 16px" }}>
            The application shell failed to load. Your data is unaffected.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              fontSize: 13,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #2a2f36",
              background: "#151920",
              color: "#e6e8eb",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ fontSize: 11, color: "#6b747e", marginTop: 16 }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
