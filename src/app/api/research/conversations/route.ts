import {jsonError, jsonOk} from "@/lib/http";
import {createSupabaseConversationStore} from "@/lib/chat/persist";
import {MULTI_DOC_MAX, MULTI_DOC_MIN} from "@/lib/chat/types";
import {normalizeDocumentIds} from "@/lib/chat/multi-ids";
import {z} from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  documentIds: z
    .array(z.string().uuid())
    .min(MULTI_DOC_MIN)
    .max(MULTI_DOC_MAX)
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
  if (ids.length < MULTI_DOC_MIN) {
    return jsonError(`Provide at least ${MULTI_DOC_MIN} document IDs via ?docs=id1,id2.`, 400);
  }
  if (ids.length > MULTI_DOC_MAX) {
    return jsonError(`At most ${MULTI_DOC_MAX} documents.`, 400);
  }

  try {
    const store = createSupabaseConversationStore();
    const conversations = await store.listConversationsForDocumentSet(ids);
    return jsonOk({conversations, documentIds: ids});
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not list conversations.", 500);
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
    return jsonError(error instanceof Error ? error.message : "Could not create conversation.", 500);
  }
}
