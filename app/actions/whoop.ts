"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { revokeWhoopAccess } from "@/lib/whoop/client";

export type DisconnectResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Disconnect WHOOP for the signed-in user.
 *
 * The privacy policy promises this exists, which is why it does: the policy said
 * "you can disconnect at any time from inside the app" while no disconnect
 * existed anywhere in the codebase. A privacy policy is a claim about behaviour,
 * so it has to be backed by behaviour.
 *
 * The three outcomes are reported distinctly on purpose. A partial disconnect —
 * our tokens gone, WHOOP's grant still standing — must not be reported as a
 * clean success, because the user's remaining action differs.
 */
export async function disconnectWhoop(): Promise<DisconnectResult> {
  // Next 14.2: headers() is synchronous here.
  const session = await await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "You are not signed in." };

  try {
    const result = await revokeWhoopAccess(session.user.id);

    if (!result.localDeleted && !result.remoteRevoked) {
      return { ok: false, error: "WHOOP was not connected, so nothing changed." };
    }

    revalidatePath("/connect/whoop");
    revalidatePath("/live");

    if (result.remoteRevoked) {
      return {
        ok: true,
        message:
          "Disconnected. Your tokens are deleted and access was revoked at WHOOP, so no further data can be read.",
      };
    }

    // Local tokens are gone, so we can no longer read anything — but we could not
    // confirm the revoke at WHOOP, so we point at the one step we cannot do.
    return {
      ok: true,
      message: `Tokens deleted, so this app can no longer read your WHOOP data. WHOOP could not confirm the revocation${
        result.reason ? ` (${result.reason})` : ""
      }, so also remove HealthOS under Apps in your WHOOP account settings.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Disconnect failed: ${message}` };
  }
}
