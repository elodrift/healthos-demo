/**
 * Name of the httpOnly cookie holding the OAuth `state` value.
 *
 * This lives in its own module rather than in the connect route because a
 * Next.js App Router route file may only export a fixed set of fields (the HTTP
 * verbs, `dynamic`, `revalidate`, and friends). Exporting anything else — even
 * a plain string constant — fails the production build with
 * `"X" is not a valid Route export field`, which `tsc` alone does not catch.
 *
 * Both the connect route (which sets the cookie) and the callback route (which
 * compares and clears it) import from here, so the name cannot drift between
 * the two halves of the flow.
 */
export const WHOOP_STATE_COOKIE = "whoop_oauth_state";
