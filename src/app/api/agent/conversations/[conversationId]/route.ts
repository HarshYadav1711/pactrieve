import {isUuid, jsonError, jsonOk} from "@/lib/http";
import {createSupabaseConversationStore} from "@/lib/chat/persist";
import {normalizeDocumentIds} from "@/lib/chat/multi-ids";
import {serverSupabase} from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {params: Promise<{conversationId: string}>};

export async function GET(request: Request, {params}: RouteContext) {
  const {conversationId} = await params;
  if (!isUuid(conversationId)) return jsonError("Invalid conversation ID.", 400);

  const url = new URL(request.url);
  const raw = url.searchParams.get("docs") ?? "";
  const requested = normalizeDocumentIds(
    raw
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  );

  try {
    const store = createSupabaseConversationStore();
    const documentIds = await store.listConversationDocumentIds(conversationId);
    if (!documentIds.length) return jsonError("Conversation not found.", 404);

    if (requested.length) {
      const exact = await store.assertConversationExactDocuments(conversationId, requested);
      if (!exact) return jsonError("Conversation does not match the selected document set.", 404);
    }

    const primaryId = documentIds[0]!;
    const conversation = await store.getConversation(conversationId, primaryId);
    if (!conversation) return jsonError("Conversation not found.", 404);

    const db = serverSupabase();
    const {data: docs} = await db
      .from("documents")
      .select("id,name,mime_type,status")
      .in("id", documentIds);

    return jsonOk({
      conversation,
      messages: conversation.messages,
      documents: docs ?? [],
      documentIds
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load conversation.", 500);
  }
}
