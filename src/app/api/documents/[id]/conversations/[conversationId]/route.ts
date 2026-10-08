import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {createSupabaseConversationStore, DEFAULT_MESSAGE_LIMIT} from "@/lib/chat/persist";

export const runtime = "nodejs";
type RouteContext = {params: Promise<{id: string; conversationId: string}>};

export async function GET(_request: Request, {params}: RouteContext) {
  const {id, conversationId} = await params;
  if (!isUuid(id) || !isUuid(conversationId)) return jsonError("Invalid identifier.", 400);
  try {
    const store = createSupabaseConversationStore();
    const conversation = await store.getConversation(conversationId, id, DEFAULT_MESSAGE_LIMIT);
    if (!conversation) return jsonError("Conversation not found for this document.", 404);
    return NextResponse.json({conversation}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return jsonError("Unable to load conversation.", 500);
  }
}
