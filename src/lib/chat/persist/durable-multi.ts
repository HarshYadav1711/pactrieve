import type {CanonicalSource} from "../../evidence/verify.ts";
import type {LlmProvider} from "../../llm/types.ts";
import type {RetrievalRequest, RetrievalResult} from "../../retrieval/types.ts";
import {primaryDocumentId} from "../multi-ids.ts";
import {runGroundedMultiDocChat} from "../multi-pipeline.ts";
import type {DocumentMeta} from "../pipeline.ts";
import type {ChatPipelineResult, ChatStreamEvent as StreamEvent} from "../types.ts";
import {
  CHECKPOINT_MIN_CHARS,
  CHECKPOINT_MIN_MS,
  type ConversationStore,
  type MessageStatus
} from "./types.ts";

export interface DurableMultiChatInput {
  documents: Array<{
    meta: DocumentMeta;
    source: CanonicalSource;
  }>;
  question: string;
  conversationId?: string;
  store: ConversationStore;
  retrieve: (request: RetrievalRequest) => Promise<RetrievalResult>;
  provider: LlmProvider;
  emit: (event: StreamEvent) => void;
  requestSignal?: AbortSignal;
  maxTokens?: number;
  cancelPollMs?: number;
}

export interface DurableMultiChatResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  documentIds: string[];
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
  return "complete";
}

/**
 * Persist a multi-document grounded chat turn.
 * Conversation associations are exact-set locked; cancellation reuses Phase 4 protocol.
 */
export async function runDurableMultiDocChat(
  input: DurableMultiChatInput
): Promise<DurableMultiChatResult> {
  const {store, question} = input;
  const documentIds = input.documents.map(d => d.meta.id);
  const primaryId = primaryDocumentId(documentIds);
  let conversationId = input.conversationId;

  if (conversationId) {
    const exact = await store.assertConversationExactDocuments(conversationId, documentIds);
    if (!exact) {
      throw Object.assign(
        new Error("Conversation does not match the selected document set."),
        {status: 404}
      );
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
    if (event.type === "completed") return;
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
    pipeline = await runGroundedMultiDocChat({
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

  let dbStatus = mapAnswerToDbStatus(pipeline.status, clientDisconnected);
  if (pipeline.status === "stopped") dbStatus = "stopped";
  if (clientDisconnected && pipeline.status === "failed") dbStatus = "interrupted";
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
    provisional: pipeline.status !== "answered",
    replacedProvisional: pipeline.replacedProvisional,
    reasonCode: pipeline.reasonCode,
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
    pipeline: {
      ...pipeline,
      answerText: finalized.content || finalContent
    },
    persistedStatus: finalized.status,
    persistenceOk: finalized.ok
  };
}
