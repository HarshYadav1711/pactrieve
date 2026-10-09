import type {CanonicalSource} from "../evidence/verify.ts";
import type {LlmProvider} from "../llm/types.ts";
import type {RetrievalRequest, RetrievalResult} from "../retrieval/types.ts";
import {primaryDocumentId} from "../chat/multi-ids.ts";
import {
  CHECKPOINT_MIN_CHARS,
  CHECKPOINT_MIN_MS,
  type ConversationStore,
  type MessageStatus
} from "../chat/persist/types.ts";
import type {AgentStreamEvent} from "./events.ts";
import {runAgentResearch, type AgentOrchestrateResult} from "./orchestrate.ts";

export interface DurableAgentInput {
  documents: Array<{
    id: string;
    name: string;
    source: CanonicalSource;
  }>;
  question: string;
  conversationId?: string;
  store: ConversationStore;
  retrieve: (request: RetrievalRequest) => Promise<RetrievalResult>;
  provider: LlmProvider;
  emit: (event: AgentStreamEvent) => void;
  requestSignal?: AbortSignal;
  maxTokens?: number;
  cancelPollMs?: number;
}

export interface DurableAgentResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  documentIds: string[];
  pipeline: AgentOrchestrateResult;
  persistedStatus: MessageStatus;
  persistenceOk: boolean;
}

function mapStatus(
  status: AgentOrchestrateResult["status"],
  disconnect: boolean
): Extract<MessageStatus, "complete" | "stopped" | "failed" | "interrupted"> {
  if (status === "stopped") return "stopped";
  if (status === "failed") return disconnect ? "interrupted" : "failed";
  return "complete";
}

export async function runDurableAgentResearch(
  input: DurableAgentInput
): Promise<DurableAgentResult> {
  const {store, question} = input;
  const documentIds = input.documents.map(d => d.id);
  const primaryId = primaryDocumentId(documentIds);
  let conversationId = input.conversationId;

  if (conversationId) {
    const exact = await store.assertConversationExactDocuments(conversationId, documentIds);
    if (!exact) {
      throw Object.assign(new Error("Conversation does not match the selected document set."), {
        status: 404
      });
    }
  } else {
    const created = await store.createConversationForDocuments(documentIds);
    conversationId = created.id;
  }

  const userMessage = await store.appendUserMessage(conversationId, primaryId, question);
  const assistantMessage = await store.createAssistantMessage(conversationId, primaryId);

  input.emit({
    type: "session",
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id
  });

  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  if (input.requestSignal) {
    if (input.requestSignal.aborted) abort.abort();
    else input.requestSignal.addEventListener("abort", onRequestAbort, {once: true});
  }

  const pollTimer = setInterval(() => {
    void store.isCancelRequested(assistantMessage.id).then(requested => {
      if (requested && !abort.signal.aborted) abort.abort();
    });
  }, input.cancelPollMs ?? 200);

  let accepted = "";
  let lastCheckpointLen = 0;
  let lastCheckpointAt = Date.now();
  let clientDisconnected = false;

  const emit: typeof input.emit = event => {
    if (event.type === "completed") return;
    if (event.type === "generation_started") {
      void store.markStreaming(assistantMessage.id);
    }
    if (event.type === "answer_delta") {
      accepted += event.text;
      const now = Date.now();
      if (
        accepted.length - lastCheckpointLen >= CHECKPOINT_MIN_CHARS ||
        now - lastCheckpointAt >= CHECKPOINT_MIN_MS
      ) {
        lastCheckpointLen = accepted.length;
        lastCheckpointAt = now;
        void store.checkpointContent(assistantMessage.id, accepted);
      }
    }
    input.emit(event);
  };

  let pipeline: AgentOrchestrateResult;
  try {
    pipeline = await runAgentResearch({
      documents: input.documents,
      question,
      retrieve: input.retrieve,
      provider: input.provider,
      emit,
      signal: abort.signal,
      maxTokens: input.maxTokens
    });
  } finally {
    clearInterval(pollTimer);
    if (input.requestSignal) input.requestSignal.removeEventListener("abort", onRequestAbort);
  }

  if (input.requestSignal?.aborted && pipeline.status !== "stopped") {
    clientDisconnected = true;
  }

  if (accepted && (pipeline.status === "stopped" || pipeline.status === "failed")) {
    await store.checkpointContent(assistantMessage.id, accepted);
  }

  const finalContent =
    pipeline.status === "stopped" || pipeline.status === "failed"
      ? accepted || pipeline.answerText
      : pipeline.answerText;

  const citations =
    pipeline.status === "answered" || pipeline.status === "stopped"
      ? pipeline.citations
      : pipeline.status === "insufficient_evidence"
        ? []
        : pipeline.citations;

  let dbStatus = mapStatus(pipeline.status, clientDisconnected);
  if (await store.isCancelRequested(assistantMessage.id) && dbStatus !== "complete") {
    if (dbStatus === "failed" || dbStatus === "interrupted") dbStatus = "stopped";
  }

  const finalized = await store.finalizeAssistant({
    messageId: assistantMessage.id,
    conversationId,
    documentId: primaryId,
    status: dbStatus,
    content: finalContent,
    citations: dbStatus === "complete" || dbStatus === "stopped" ? citations : []
  });

  input.emit({
    type: "completed",
    status: pipeline.status,
    answerText: finalized.content || finalContent,
    citations: dbStatus === "complete" || dbStatus === "stopped" ? citations : [],
    coverageStatus: pipeline.coverageStatus,
    rejectedEvidenceIds: pipeline.rejectedEvidenceIds,
    replacedProvisional: pipeline.replacedProvisional,
    limitReason: pipeline.limitReason,
    rounds: pipeline.rounds,
    toolCalls: pipeline.toolCalls,
    modelRequests: pipeline.modelRequests,
    conversationId,
    assistantMessageId: assistantMessage.id,
    persistedStatus: finalized.status as "complete" | "stopped" | "failed" | "interrupted",
    persistenceOk: finalized.ok
  });

  return {
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    documentIds,
    pipeline: {...pipeline, answerText: finalized.content || finalContent},
    persistedStatus: finalized.status,
    persistenceOk: finalized.ok
  };
}
