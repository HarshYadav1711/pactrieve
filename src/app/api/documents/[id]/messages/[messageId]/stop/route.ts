import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {createSupabaseConversationStore} from "@/lib/chat/persist";

export const runtime = "nodejs";
type RouteContext = {params: Promise<{id: string; messageId: string}>};

/**
 * Request cancellation for an in-flight assistant generation.
 * Sets cancel_requested in the database; the active chat stream polls and aborts the provider.
 * Does not invent terminal content — the streaming handler finalizes after persistence.
 */
export async function POST(_request: Request, {params}: RouteContext) {
  const {id, messageId} = await params;
  if (!isUuid(id) || !isUuid(messageId)) return jsonError("Invalid identifier.", 400);
  try {
    const store = createSupabaseConversationStore();
    const result = await store.requestCancel(messageId, id);
    if (!result.ok || result.status === null) {
      return jsonError("Message not found for this document.", 404);
    }
    return NextResponse.json(
      {
        ok: true,
        messageId,
        status: result.status,
        alreadyTerminal: result.alreadyTerminal,
        cancelRequested: !result.alreadyTerminal || result.status === "stopped"
      },
      {headers: {"Cache-Control": "no-store"}}
    );
  } catch {
    return jsonError("Unable to request stop.", 500);
  }
}
