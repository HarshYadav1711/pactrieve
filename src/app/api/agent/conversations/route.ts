import {jsonError, jsonOk} from "@/lib/http";
import {createSupabaseConversationStore} from "@/lib/chat/persist";
import {normalizeDocumentIds} from "@/lib/chat/multi-ids";
import {AGENT_LIMITS} from "@/lib/agent/limits";
import {z} from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  documentIds: z
    .array(z.string().uuid())
    .min(AGENT_LIMITS.minDocuments)
    .max(AGENT_LIMITS.maxDocuments)
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("docs") ?? url.searchParams.get("documentIds") ?? "";
  const ids = normalizeDocumentIds(
    raw
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  );
  if (ids.length < AGENT_LIMITS.minDocuments) {
    return jsonError(`Provide at least ${AGENT_LIMITS.minDocuments} document ID via ?docs=.`, 400);
  }
  if (ids.length > AGENT_LIMITS.maxDocuments) {
    return jsonError(`At most ${AGENT_LIMITS.maxDocuments} documents.`, 400);
  }

  try {
    const store = createSupabaseConversationStore();
    const conversations = await store.listConversationsForDocumentSet(ids);
    return jsonOk({conversations, documentIds: ids});
  } catch (error) {
    return jsonError("Could not list conversations.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON.", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }
  const documentIds = normalizeDocumentIds(parsed.data.documentIds);
  if (documentIds.length !== parsed.data.documentIds.length) {
    return jsonError("Duplicate document IDs are not allowed.", 400);
  }

  try {
    const store = createSupabaseConversationStore();
    const conversation = await store.createConversationForDocuments(documentIds);
    return jsonOk({conversation}, 201);
  } catch (error) {
    return jsonError("Could not create conversation.", 500);
  }
}
