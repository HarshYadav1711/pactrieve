import {jsonError} from "@/lib/http";
import {getDocumentSource} from "@/lib/documents/load";
import {retrieveDocument} from "@/lib/retrieval";
import {
  encodeSseEvent,
  multiDocChatSchema,
  MULTI_DOC_MAX,
  MULTI_DOC_MIN,
  type ChatStreamEvent
} from "@/lib/chat";
import {createOpenAiCompatibleProvider, loadLlmConfig} from "@/lib/llm";
import {createSupabaseConversationStore} from "@/lib/chat/persist";
import {runDurableMultiDocChat} from "@/lib/chat/persist/durable-multi";
import {normalizeDocumentIds} from "@/lib/chat/multi-ids";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON.", 400);
  }

  const parsed = multiDocChatSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return jsonError(issue?.message ?? "Invalid multi-document chat request.", 400);
  }

  const documentIds = normalizeDocumentIds(parsed.data.documentIds);
  if (documentIds.length < MULTI_DOC_MIN) {
    return jsonError(`Select at least ${MULTI_DOC_MIN} documents.`, 400);
  }
  if (documentIds.length > MULTI_DOC_MAX) {
    return jsonError(`Select at most ${MULTI_DOC_MAX} documents.`, 400);
  }
  if (documentIds.length !== parsed.data.documentIds.length) {
    return jsonError("Duplicate document IDs are not allowed.", 400);
  }

  const llm = loadLlmConfig();
  if (!llm.ok) return jsonError(llm.message, 503);

  const loaded: Array<{
    meta: {id: string; name: string; status: string; unreadable_page_count?: number};
    source: NonNullable<Awaited<ReturnType<typeof getDocumentSource>>>["source"];
  }> = [];
  for (const id of documentIds) {
    let data: Awaited<ReturnType<typeof getDocumentSource>>;
    try {
      data = await getDocumentSource(id);
    } catch {
      return jsonError(`Unable to load document ${id}.`, 500);
    }
    if (!data) return jsonError(`Document not found: ${id}`, 404);
    if (data.document.status !== "ready") {
      return jsonError(
        `Document "${data.document.name}" is not ready for analysis (status: ${data.document.status}).`,
        409
      );
    }
    loaded.push({
      meta: {
        id: data.document.id,
        name: data.document.name,
        status: data.document.status,
        unreadable_page_count: data.document.unreadable_page_count
      },
      source: data.source
    });
  }

  const provider = createOpenAiCompatibleProvider(llm.config);
  const store = createSupabaseConversationStore();
  const encoder = new TextEncoder();
  const question = parsed.data.question;
  const conversationId = parsed.data.conversationId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(encodeSseEvent(event)));
      };
      try {
        await runDurableMultiDocChat({
          documents: loaded,
          conversationId,
          question,
          store,
          retrieve: req => retrieveDocument(req),
          provider,
          emit,
          requestSignal: request.signal,
          maxTokens: llm.config.maxTokens
        });
      } catch (error) {
        const status =
          typeof error === "object" && error && "status" in error
            ? Number((error as {status: number}).status)
            : 500;
        emit({
          type: "error",
          code: status === 404 ? "CONVERSATION_NOT_FOUND" : "CHAT_PIPELINE_FAILED",
          message: error instanceof Error ? error.message : "Multi-document chat failed."
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
