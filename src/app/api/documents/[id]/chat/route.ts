import {isUuid, jsonError} from "@/lib/http";
import {getDocumentSource} from "@/lib/documents/load";
import {retrieveDocument} from "@/lib/retrieval";
import {chatQuestionSchema, encodeSseEvent, runGroundedChat, type ChatStreamEvent} from "@/lib/chat";
import {createOpenAiCompatibleProvider, loadLlmConfig} from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {params: Promise<{id: string}>};

export async function POST(request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.", 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON.", 400);
  }

  const parsed = chatQuestionSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.message ?? "Invalid question.";
    return jsonError(message, 400);
  }

  const llm = loadLlmConfig();
  if (!llm.ok) {
    return jsonError(llm.message, 503);
  }

  let data: Awaited<ReturnType<typeof getDocumentSource>>;
  try {
    data = await getDocumentSource(id);
  } catch {
    return jsonError("Unable to load document.", 500);
  }

  if (!data) return jsonError("Document not found.", 404);
  if (data.document.status !== "ready") {
    return jsonError("Document is not ready for chat. Wait until processing completes.", 409);
  }

  const provider = createOpenAiCompatibleProvider(llm.config);
  const encoder = new TextEncoder();
  const question = parsed.data.question;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(encodeSseEvent(event)));
      };
      try {
        await runGroundedChat({
          documentId: id,
          question,
          document: {
            id: data!.document.id,
            name: data!.document.name,
            status: data!.document.status,
            unreadable_page_count: data!.document.unreadable_page_count
          },
          source: data!.source,
          retrieve: req => retrieveDocument(req),
          provider,
          emit,
          signal: request.signal,
          maxTokens: llm.config.maxTokens
        });
      } catch (error) {
        emit({
          type: "error",
          code: "CHAT_PIPELINE_FAILED",
          message: error instanceof Error ? error.message : "Chat pipeline failed."
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
