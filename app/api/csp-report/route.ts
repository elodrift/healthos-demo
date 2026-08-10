/**
 * Receiver for Content-Security-Policy-Report-Only violations.
 *
 * Report-Only mode blocks nothing; its entire value is the reports it sends. The
 * policy in next.config.mjs named no `report-uri`, so the browser had nowhere to
 * send them — the header was doing literally nothing, and the note calling the
 * switch to enforcing mode "a deliberate follow-up" had no data to make that
 * decision with.
 *
 * With this endpoint, a week of real traffic tells you exactly which directives
 * would break if the policy were enforced. That is the missing input.
 *
 * Deliberately unauthenticated: the browser posts these without credentials.
 * Deliberately cheap: parse, log, 204. Never trust the body for anything else.
 *
 * Unauthenticated also means there is no user id to key a rate limit on, so
 * this is the one endpoint in the app throttled by IP rather than session —
 * see the `cspReport` bucket in lib/rate-limit.ts. A tripped limit still
 * answers 204: a 429 here would just teach the browser's reporting queue to
 * retry, and the report is not worth accepting twice.
 */

import { type NextRequest, NextResponse } from "next/server";

import { log } from "@/lib/log";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Best-effort only — used to key a rate-limit bucket, never a security decision. */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: NextRequest) {
  const limit = checkRateLimit("cspReport", clientIp(request));
  if (!limit.ok) return new NextResponse(null, { status: 204 });

  try {
    const body = (await request.json()) as Record<string, unknown>;

    // Two wire formats in the wild: the legacy `report-uri` envelope nests the
    // payload under "csp-report"; the Reporting API sends it flat. Accept both.
    const nested = body["csp-report"];
    const report: Record<string, unknown> =
      nested && typeof nested === "object" ? (nested as Record<string, unknown>) : body;

    const field = (...names: string[]): string => {
      for (const n of names) {
        const v = report[n];
        if (typeof v === "string" && v) return v.slice(0, 200);
      }
      return "unknown";
    };

    log.warn("csp.violation", {
      directive: field("violated-directive", "effectiveDirective"),
      blocked: field("blocked-uri", "blockedURL"),
      document: field("document-uri", "documentURL"),
    });
  } catch {
    // A malformed report is not worth a 4xx; the browser will not retry usefully.
  }
  return new NextResponse(null, { status: 204 });
}
