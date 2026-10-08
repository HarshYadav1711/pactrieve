import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {getDocumentSource} from "@/lib/documents/load";
import {createSupabaseConversationStore, DEFAULT_CONVERSATION_LIMIT} from "@/lib/chat/persist";

export const runtime = "nodejs";
type RouteContext = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.", 400);
  try {
    const doc = await getDocumentSource(id);
    if (!doc) return jsonError("Document not found.", 404);
    const store = createSupabaseConversationStore();
    const conversations = await store.listConversations(id, DEFAULT_CONVERSATION_LIMIT);
    return NextResponse.json({conversations}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return jsonError("Unable to list conversations.", 500);
  }
}

export async function POST(_request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.", 400);
  try {
    const doc = await getDocumentSource(id);
    if (!doc) return jsonError("Document not found.", 404);
    if (doc.document.status !== "ready") {
      return jsonError("Document is not ready for chat.", 409);
    }
    const store = createSupabaseConversationStore();
    const conversation = await store.createConversation(id);
    return NextResponse.json({conversation}, {status: 201, headers: {"Cache-Control": "no-store"}});
  } catch {
    return jsonError("Unable to create conversation.", 500);
  }
}
