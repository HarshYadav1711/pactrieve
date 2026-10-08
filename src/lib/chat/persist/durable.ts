import type {CanonicalSource} from "../../evidence/verify.ts";
import type {LlmProvider} from "../../llm/types.ts";
import type {RetrievalRequest, RetrievalResult} from "../../retrieval/types.ts";
import {runGroundedChat} from "../pipeline.ts";
import type {DocumentMeta} from "../pipeline.ts";
import type {ChatPipelineResult} from "../types.ts";
import type {ChatStreamEvent as StreamEvent} from "../types.ts";
import {
  CHECKPOINT_MIN_CHARS,
  CHECKPOINT_MIN_MS,
  type ConversationStore,
  type MessageStatus
} from "./types.ts";

export interface DurableChatInput {
  documentId: string;
  document: DocumentMeta;
  source: CanonicalSource;
  question: string;
  conversationId?: string;
  store: ConversationStore;
  retrieve: (request: RetrievalRequest) => Promise<RetrievalResult>;
  provider: LlmProvider;
  emit: (event: StreamEvent) => void;
  requestSignal?: AbortSignal;
  maxTokens?: number;
  /** How often to poll cancel_requested while streaming. */
  cancelPollMs?: number;
}

export interface DurableChatResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  pipeline: ChatPipelineResult;
  persistedStatus: MessageStatus;
  persistenceOk: boolean;
}

function mapAnswerToDbStatus(
  status: ChatPipelineResult["status"],
  disconnect: boolean
): Extract<MessageStatus, "complete" | "stopped" | "failed" | "interrupted"> {
  if (status === "stopped") return "stopped";
  if (status === "failed") return disconnect ? "interrupted" : "failed";
  // answered + insufficient_evidence are durable complete outcomes
  return "complete";
}

/**
 * Persist conversation messages around the Phase 3 grounded pipeline.
 * Cancellation is DB-authoritative via cancel_requested + AbortSignal.
 */
export async function runDurableGroundedChat(input: DurableChatInput): Promise<DurableChatResult> {
  const {store, documentId, question} = input;
  let conversationId = input.conversationId;

  if (conversationId) {
    const ok = await store.assertConversationDocument(conversationId, documentId);
    if (!ok) throw Object.assign(new Error("Conversation does not belong to this document."), {status: 404});
  } else {
    const created = await store.createConversation(documentId);
    conversationId = created.id;
  }

  const userMessage = await store.appendUserMessage(conversationId, documentId, question);
  const assistantMessage = await store.createAssistantMessage(conversationId, documentId);

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

  const pollMs = input.cancelPollMs ?? 200;
  const pollTimer = setInterval(() => {
    void store.isCancelRequested(assistantMessage.id).then(requested => {
      if (requested && !abort.signal.aborted) abort.abort();
    });
  }, pollMs);

  let accepted = "";
  let lastCheckpointLen = 0;
  let lastCheckpointAt = Date.now();
  let clientDisconnected = false;

  const emit: typeof input.emit = event => {
    if (event.type === "completed") {
      // Durable layer emits a single completed event after persistence.
      return;
    }
    if (event.type === "generation_started") {
      void store.markStreaming(assistantMessage.id);
      input.emit({...event, assistantMessageId: assistantMessage.id});
      return;
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

  let pipeline: ChatPipelineResult;
  try {
    pipeline = await runGroundedChat({
      documentId,
      question,
      document: input.document,
      source: input.source,
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

  // Flush last accepted text before terminal write.
  if (accepted && (pipeline.status === "stopped" || pipeline.status === "failed")) {
    await store.checkpointContent(assistantMessage.id, accepted);
  }

  const finalContent =
    pipeline.status === "stopped" || pipeline.status === "failed"
      ? (accepted || pipeline.answerText)
      : pipeline.answerText;

  // Prefer pipeline citations for complete/stopped; never persist modelDraft as answer.
  const citations =
    pipeline.status === "answered" || pipeline.status === "stopped"
      ? pipeline.citations
      : pipeline.status === "insufficient_evidence"
        ? []
        : pipeline.citations;

  let dbStatus = mapAnswerToDbStatus(pipeline.status, clientDisconnected);
  if (pipeline.status === "stopped") dbStatus = "stopped";
  if (clientDisconnected && pipeline.status === "failed") dbStatus = "interrupted";
  // If cancel was requested, prefer stopped even if provider raced to fail.
  if (await store.isCancelRequested(assistantMessage.id) && !["complete"].includes(dbStatus)) {
    if (dbStatus === "failed" || dbStatus === "interrupted") dbStatus = "stopped";
  }

  const finalized = await store.finalizeAssistant({
    messageId: assistantMessage.id,
    conversationId,
    documentId,
    status: dbStatus,
    content: finalContent,
    citations: dbStatus === "complete" || dbStatus === "stopped" ? citations : []
  });

  const persistenceOk = finalized.ok;
  const persistedStatus = finalized.status;

  // Re-emit completed with persistence metadata for the client.
  input.emit({
    type: "completed",
    status: pipeline.status,
    answerText: finalized.content || finalContent,
    citations: dbStatus === "complete" || dbStatus === "stopped" ? citations : [],
    coverageStatus: pipeline.coverageStatus,
    rejectedEvidenceIds: pipeline.rejectedEvidenceIds,
    provisional: pipeline.status !== "answered",
    replacedProvisional: pipeline.replacedProvisional,
    reasonCode: pipeline.reasonCode,
    conversationId,
    assistantMessageId: assistantMessage.id,
    persistedStatus: persistedStatus as "complete" | "stopped" | "failed" | "interrupted",
    persistenceOk
  });

  return {
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    pipeline: {
      ...pipeline,
      answerText: finalized.content || finalContent
    },
    persistedStatus,
    persistenceOk
  };
}

// Re-export DocumentMeta typing bridge
export type {DocumentMeta, ChatPipelineResult};
