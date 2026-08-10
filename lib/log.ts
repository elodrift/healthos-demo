/**
 * Structured logging.
 *
 * Replaces the `console.log("[v0] ...")` calls that were the app's only
 * observability. Two reasons the difference matters here rather than being
 * housekeeping:
 *
 *  1. JSON lines are queryable in Vercel's log drain; interpolated strings are
 *     not, so a recurring model failure was invisible unless someone happened to
 *     be watching the stream.
 *  2. This app holds health data. A logger with an explicit field allowlist
 *     makes "we do not log meal contents" a property of the code rather than a
 *     habit that survives until the next debugging session.
 *
 * Never pass user content. Pass ids, counts, durations, and error messages.
 */

type Level = "debug" | "info" | "warn" | "error";

type Fields = Record<string, string | number | boolean | null | undefined>;

const REDACT = /^(email|password|token|secret|authorization|cookie|note|description|placeName)$/i;

function emit(level: Level, event: string, fields: Fields = {}, error?: unknown) {
  const safe: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    safe[k] = REDACT.test(k) ? "[redacted]" : v;
  }

  const line = {
    level,
    event,
    at: new Date().toISOString(),
    ...safe,
    ...(error
      ? {
          err: error instanceof Error ? error.message : String(error),
          errName: error instanceof Error ? error.name : undefined,
        }
      : {}),
  };

  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

export const log = {
  debug: (event: string, fields?: Fields) => emit("debug", event, fields),
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields, error?: unknown) => emit("warn", event, fields, error),
  error: (event: string, fields?: Fields, error?: unknown) => emit("error", event, fields, error),
};
