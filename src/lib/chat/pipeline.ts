import type {CanonicalSource} from "../evidence/verify.ts";
import type {LlmProvider} from "../llm/types.ts";
import type {RetrievalRequest, RetrievalResult} from "../retrieval/types.ts";
import {resolveCitations, findLiteralQuotedEvidence} from "./citations.ts";
import {prepareEvidenceRegistry} from "./evidence.ts";
import {
  buildChatMessages,
  insufficientEvidenceMessage,
  unsupportedAfterGenerationMessage
} from "./prompts.ts";
import type {
  ChatPipelineResult,
  ChatStreamEvent,
  UnsupportedReasonCode,
  VerifiedCitation
} from "./types.ts";

export interface DocumentMeta {
  id: string;
  name: string;
  status: string;
  unreadable_page_count?: number;
}

export interface ChatPipelineDeps {
  documentId: string;
  question: string;
  document: DocumentMeta;
  source: CanonicalSource;
  retrieve: (request: RetrievalRequest) => Promise<RetrievalResult>;
  provider: LlmProvider;
  emit: (event: ChatStreamEvent) => void;
  signal?: AbortSignal;
  evidenceCharBudget?: number;
  maxTokens?: number;
}

const GENERABLE_COVERAGE = new Set(["MATCHES_FOUND", "PARTIAL_SOURCE"]);

/**
 * Grounded single-document chat pipeline.
 * Retrieval → verified evidence registry → streamed generation → citation resolution.
 */
export async function runGroundedChat(deps: ChatPipelineDeps): Promise<ChatPipelineResult> {
  const {documentId, question, document, source, retrieve, provider, emit, signal} = deps;

  emit({type: "retrieval_started", documentId, question});

  let retrieval: RetrievalResult;
  try {
    retrieval = await retrieve({
      documentId,
      // Light interrogative cleanup improves lexical recall for conversational questions
      // without changing the user-visible question text.
      query: toRetrievalQuery(question),
      limit: 8,
      mode: "ranked",
      expand: true,
      maxExpandedChars: 4500
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retrieval failed.";
    emit({type: "error", code: "SEARCH_FAILED", message});
    return {
      status: "failed",
      answerText: "",
      citations: [],
      coverageStatus: "SEARCH_FAILED",
      rejectedEvidenceIds: [],
      evidenceCount: 0,
      promptChars: 0,
      truncated: false,
      replacedProvisional: false,
      reasonCode: "PROVIDER_FAILED"
    };
  }

  const prepared = prepareEvidenceRegistry(documentId, source, retrieval, {
    charBudget: deps.evidenceCharBudget
  });

  const messages = buildChatMessages({
    question,
    documentId,
    documentName: document.name,
    evidence: prepared.items,
    coverage: retrieval.coverage,
    truncated: prepared.truncated
  });
  const promptChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);

  emit({
    type: "evidence_prepared",
    evidence: prepared.items,
    coverage: retrieval.coverage,
    truncated: prepared.truncated,
    promptChars
  });

  const canGenerate =
    GENERABLE_COVERAGE.has(retrieval.coverage.status) && prepared.items.length > 0;

  if (!canGenerate) {
    const answerText = insufficientEvidenceMessage(retrieval.coverage);
    emit({type: "answer_delta", text: answerText});
    const completed: ChatPipelineResult = {
      status: "insufficient_evidence",
      answerText,
      citations: [],
      coverageStatus: retrieval.coverage.status,
      rejectedEvidenceIds: [],
      evidenceCount: prepared.items.length,
      promptChars,
      truncated: prepared.truncated,
      replacedProvisional: false,
      reasonCode: "RETRIEVAL_INSUFFICIENT"
    };
    emit({
      type: "completed",
      status: completed.status,
      answerText,
      citations: [],
      coverageStatus: retrieval.coverage.status,
      rejectedEvidenceIds: [],
      provisional: false,
      replacedProvisional: false,
      reasonCode: "RETRIEVAL_INSUFFICIENT"
    });
    return completed;
  }

  emit({type: "generation_started"});

  let answerText = "";
  let providerFailed: {code: string; message: string} | null = null;

  try {
    for await (const event of provider.streamChat({
      messages,
      maxTokens: deps.maxTokens,
      temperature: 0,
      signal
    })) {
      if (signal?.aborted) {
        providerFailed = {code: "CLIENT_ABORTED", message: "Request was cancelled."};
        break;
      }
      if (event.kind === "delta") {
        answerText += event.text;
        emit({type: "answer_delta", text: event.text});
      } else if (event.kind === "error") {
        providerFailed = {code: event.code, message: event.message};
        break;
      }
    }
  } catch (error) {
    providerFailed = {
      code: "PROVIDER_ERROR",
      message: error instanceof Error ? error.message : "Provider failed."
    };
  }

  // User/server cancellation: keep accepted partial text; resolve only complete citation markers.
  if (providerFailed?.code === "CLIENT_ABORTED") {
    const resolution = resolveCitations(documentId, source, prepared.items, answerText);
    const citations = resolution.citations;
    for (const citation of citations) emit({type: "citation", citation});
    const result: ChatPipelineResult = {
      status: "stopped",
      answerText,
      citations,
      coverageStatus: retrieval.coverage.status,
      rejectedEvidenceIds: resolution.rejectedEvidenceIds,
      evidenceCount: prepared.items.length,
      promptChars,
      truncated: prepared.truncated,
      replacedProvisional: false
    };
    emit({
      type: "completed",
      status: result.status,
      answerText: result.answerText,
      citations: result.citations,
      coverageStatus: result.coverageStatus,
      rejectedEvidenceIds: result.rejectedEvidenceIds,
      provisional: true,
      replacedProvisional: false
    });
    return result;
  }

  if (providerFailed) {
    emit({type: "error", code: providerFailed.code, message: providerFailed.message});
    // Preserve partial text for durable failed/interrupted finalization by the caller.
    const result: ChatPipelineResult = {
      status: "failed",
      answerText: answerText.length
        ? answerText
        : unsupportedAfterGenerationMessage(),
      citations: [],
      coverageStatus: retrieval.coverage.status,
      rejectedEvidenceIds: [],
      evidenceCount: prepared.items.length,
      promptChars,
      truncated: prepared.truncated,
      replacedProvisional: false,
      reasonCode: "PROVIDER_FAILED",
      modelDraft: answerText || undefined
    };
    emit({
      type: "completed",
      status: result.status,
      answerText: result.answerText,
      citations: [],
      coverageStatus: result.coverageStatus,
      rejectedEvidenceIds: [],
      provisional: true,
      replacedProvisional: false,
      reasonCode: "PROVIDER_FAILED"
    });
    return result;
  }

  const resolution = resolveCitations(documentId, source, prepared.items, answerText);
  let citations: VerifiedCitation[] = resolution.citations;

  // If the model answered without ID markers but literally quoted evidence, accept those.
  if (!citations.length) {
    citations = findLiteralQuotedEvidence(documentId, source, prepared.items, answerText);
  }

  for (const citation of citations) {
    emit({type: "citation", citation});
  }

  const looksLikeAbstention = /insufficient evidence|cannot be established|not established|retrieved material/i.test(
    answerText
  );

  let status: ChatPipelineResult["status"] = "answered";
  let finalText = answerText;
  let finalCitations = citations;
  let replacedProvisional = false;
  let reasonCode: UnsupportedReasonCode | undefined;
  let modelDraft: string | undefined;

  const withdrawUnsupported = (code: UnsupportedReasonCode) => {
    status = "insufficient_evidence";
    modelDraft = answerText;
    finalText = unsupportedAfterGenerationMessage();
    finalCitations = [];
    replacedProvisional = answerText.length > 0;
    reasonCode = code;
  };

  if (resolution.hasUnsupportedCitations && !citations.length && !looksLikeAbstention) {
    withdrawUnsupported("REJECTED_EVIDENCE_IDS");
  } else if (status === "answered" && !finalCitations.length && !looksLikeAbstention) {
    withdrawUnsupported("NO_VERIFIED_CITATIONS");
  } else if (looksLikeAbstention && !finalCitations.length) {
    status = "insufficient_evidence";
    reasonCode = "NO_VERIFIED_CITATIONS";
    // Model already abstained in prose — keep that abstention text (not a factual claim).
    finalText = answerText.trim() || unsupportedAfterGenerationMessage();
    finalCitations = [];
  }

  const result: ChatPipelineResult = {
    status,
    answerText: finalText,
    citations: finalCitations,
    coverageStatus: retrieval.coverage.status,
    rejectedEvidenceIds: resolution.rejectedEvidenceIds,
    evidenceCount: prepared.items.length,
    promptChars,
    truncated: prepared.truncated,
    replacedProvisional,
    reasonCode,
    modelDraft
  };

  emit({
    type: "completed",
    status: result.status,
    answerText: result.answerText,
    citations: result.citations,
    coverageStatus: result.coverageStatus,
    rejectedEvidenceIds: result.rejectedEvidenceIds,
    provisional: result.status !== "answered" || result.rejectedEvidenceIds.length > 0,
    replacedProvisional: result.replacedProvisional,
    reasonCode: result.reasonCode
  });

  return result;
}

/** Strip leading interrogatives / filler so lexical retrieval sees content terms. */
export function toRetrievalQuery(question: string): string {
  const cleaned = question
    .replace(/[?？]/g, " ")
    .replace(
      /\b(?:what|where|when|who|whom|which|how|does|do|did|is|are|was|were|can|could|would|should|please|tell|me|about|the|a|an)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  // Fall back to the original if cleanup removed everything meaningful.
  return cleaned.length >= 3 ? cleaned : question.trim();
}
