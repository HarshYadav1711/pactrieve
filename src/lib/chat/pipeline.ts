import type {CanonicalSource} from "../evidence/verify.ts";
import type {LlmProvider} from "../llm/types.ts";
import type {RetrievalRequest, RetrievalResult} from "../retrieval/types.ts";
import {resolveCitations, findLiteralQuotedEvidence} from "./citations.ts";
import {prepareEvidenceRegistry} from "./evidence.ts";
import {buildChatMessages, insufficientEvidenceMessage} from "./prompts.ts";
import type {ChatPipelineResult, ChatStreamEvent, VerifiedCitation} from "./types.ts";

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
      truncated: false
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
  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);

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
      truncated: prepared.truncated
    };
    emit({
      type: "completed",
      status: completed.status,
      answerText,
      citations: [],
      coverageStatus: retrieval.coverage.status,
      rejectedEvidenceIds: [],
      provisional: false
    });
    return completed;
  }

  // PARTIAL_SOURCE with matches: disclose limitation before generation.
  if (retrieval.coverage.status === "PARTIAL_SOURCE" || retrieval.coverage.unreadablePageCount > 0) {
    // Limitation is also in the prompt; surface a status via evidence_prepared coverage.
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

  if (providerFailed) {
    emit({type: "error", code: providerFailed.code, message: providerFailed.message});
    return {
      status: "failed",
      answerText,
      citations: [],
      coverageStatus: retrieval.coverage.status,
      rejectedEvidenceIds: [],
      evidenceCount: prepared.items.length,
      promptChars,
      truncated: prepared.truncated
    };
  }

  const resolution = resolveCitations(documentId, source, prepared.items, answerText);
  let citations: VerifiedCitation[] = resolution.citations;

  // If the model answered without [eN] markers but literally quoted evidence, accept those.
  if (!citations.length) {
    citations = findLiteralQuotedEvidence(documentId, source, prepared.items, answerText);
  }

  for (const citation of citations) {
    emit({type: "citation", citation});
  }

  // Unsupported fabricated citations → do not present as a fully verified answer.
  const looksLikeAbstention = /insufficient evidence|cannot be established|not established|retrieved material/i.test(
    answerText
  );

  let status: ChatPipelineResult["status"] = "answered";
  let finalText = answerText;
  let finalCitations = citations;

  if (resolution.hasUnsupportedCitations) {
    // Strip trust from unsupported refs: keep verified citations only; mark answer provisional via status.
    if (!citations.length && !looksLikeAbstention) {
      status = "insufficient_evidence";
      finalText =
        answerText.trim() +
        "\n\n[Verification] One or more cited evidence IDs were not in the verified registry and were rejected. " +
        "The answer cannot be treated as fully source-supported.";
      finalCitations = [];
    }
  }

  // Model produced prose with zero attached evidence and no abstention language.
  if (status === "answered" && !finalCitations.length && !looksLikeAbstention) {
    status = "insufficient_evidence";
    finalText =
      answerText.trim() +
      "\n\n[Verification] No verified supporting quotations were established for this answer. " +
      "Treat the response as unsupported.";
  }

  const result: ChatPipelineResult = {
    status,
    answerText: finalText,
    citations: finalCitations,
    coverageStatus: retrieval.coverage.status,
    rejectedEvidenceIds: resolution.rejectedEvidenceIds,
    evidenceCount: prepared.items.length,
    promptChars,
    truncated: prepared.truncated
  };

  emit({
    type: "completed",
    status: result.status,
    answerText: result.answerText,
    citations: result.citations,
    coverageStatus: result.coverageStatus,
    rejectedEvidenceIds: result.rejectedEvidenceIds,
    provisional: result.status !== "answered" || result.rejectedEvidenceIds.length > 0
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
