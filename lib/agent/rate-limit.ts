/**
 * Kept as the chat route's entry point so the call site reads the same, but the
 * implementation now lives in lib/rate-limit.ts where three other endpoints can
 * reach it. See that file for the in-memory caveat and the Redis upgrade path.
 */
import { checkRateLimit as check, type RateLimitResult } from "@/lib/rate-limit";

export type { RateLimitResult };

export function checkRateLimit(userId: string): RateLimitResult {
  return check("chat", userId);
}
