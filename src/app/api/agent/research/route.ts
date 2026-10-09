import {jsonError} from "@/lib/http";
import {getDocumentSource} from "@/lib/documents/load";
import {retrieveDocument} from "@/lib/retrieval";
import {normalizeDocumentIds} from "@/lib/chat/multi-ids";
import {createSupabaseConversationStore} from "@/lib/chat/persist";
import {
  agentResearchSchema,
  encodeAgentSseEvent,
  runDurableAgentResearch,
  AGENT_LIMITS,
  type AgentStreamEvent
} from "@/lib/agent";
import {createOpenAiCompatibleProvider, loadLlmConfig} from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON.", 400);
  }

  const parsed = agentResearchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Invalid agent research request.", 400);
  }

  const documentIds = normalizeDocumentIds(parsed.data.documentIds);
  if (documentIds.length < AGENT_LIMITS.minDocuments) {
    return jsonError(`Select at least ${AGENT_LIMITS.minDocuments} document.`, 400);
  }
  if (documentIds.length > AGENT_LIMITS.maxDocuments) {
    return jsonError(`Select at most ${AGENT_LIMITS.maxDocuments} documents.`, 400);
  }
  if (documentIds.length !== parsed.data.documentIds.length) {
    return jsonError("Duplicate document IDs are not allowed.", 400);
  }

  const llm = loadLlmConfig();
  if (!llm.ok) return jsonError(llm.message, 503);

  const loaded: Array<{
    id: string;
    name: string;
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
        `Document "${data.document.name}" is not ready (status: ${data.document.status}).`,
        409
      );
    }
    loaded.push({
      id: data.document.id,
      name: data.document.name,
      source: data.source
    });
  }

  const provider = createOpenAiCompatibleProvider(llm.config);
  if (!provider.chatWithTools) {
    return jsonError("Configured LLM provider does not support tool calling.", 503);
  }

  const store = createSupabaseConversationStore();
  const encoder = new TextEncoder();
  const question = parsed.data.question;
  const conversationId = parsed.data.conversationId;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AgentStreamEvent) => {
        controller.enqueue(encoder.encode(encodeAgentSseEvent(event)));
      };
      try {
        await runDurableAgentResearch({
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
        const message = error instanceof Error ? error.message : "Agent research failed.";
        emit({type: "error", code: "AGENT_FAILED", message});
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
