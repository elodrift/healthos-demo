/** @type {import('next').NextConfig} */

/*
 * Baseline response headers.
 *
 * None of these are required for the app to run — they are defence in depth for
 * the deployed site. The v0 chat preview strips framing and CSP headers so the
 * app still renders in an iframe; everything here applies on the real domain.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },

  /*
   * This app holds health data behind a login, so it should never be framed by
   * another origin. That rules out embedding it elsewhere, which is the right
   * trade for an authenticated product rather than a public showcase.
   */
  { key: "X-Frame-Options", value: "SAMEORIGIN" },

  /*
   * `geolocation=(self)` rather than `()`.
   *
   * The check-in form genuinely asks for coordinates, so denying geolocation
   * outright would silently break the one feature that puts real pins on the
   * map. Camera and microphone are unused — meal photos go through an ordinary
   * file picker, which this policy does not govern — so both are denied.
   */
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },

  /*
   * Report-only for now, deliberately.
   *
   * Report-only logs violations and blocks nothing, so it cannot break the live
   * site while the policy is still being shaped — but it also protects nothing
   * until it becomes the enforcing `Content-Security-Policy`. That switch is a
   * deliberate follow-up, not an oversight.
   *
   * `img-src` must include the CARTO basemap CDN and `data:`, or the Leaflet
   * tiles and marker icons vanish. Neon and WHOOP are absent from `connect-src`
   * on purpose: both are only ever called server-side, so the browser never
   * opens a connection to either.
   */
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.public.blob.vercel-storage.com",
      "style-src 'self' 'unsafe-inline'",
      // Next.js emits inline hydration scripts; a nonce is the real fix here.
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
