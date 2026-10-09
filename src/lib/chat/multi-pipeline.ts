import type {CanonicalSource} from "../evidence/verify.ts";
import type {LlmProvider} from "../llm/types.ts";
import type {RetrievalRequest, RetrievalResult, RetrievalCoverage} from "../retrieval/types.ts";
import {
  findLiteralQuotedEvidenceMulti,
  resolveCitationsMulti
} from "./citations.ts";
import {
  MULTI_DOC_EVIDENCE_CHAR_BUDGET,
  prepareMultiDocumentEvidenceRegistry
} from "./evidence.ts";
import {
  aggregateMultiDocCoverage,
  buildMultiDocChatMessages,
  insufficientEvidenceMessage,
  unsupportedAfterGenerationMessage
} from "./prompts.ts";
import {toRetrievalQuery, type DocumentMeta} from "./pipeline.ts";
import {normalizeDocumentIds, primaryDocumentId} from "./multi-ids.ts";
import type {
  ChatPipelineResult,
  ChatStreamEvent,
  PerDocumentCoverage,
  UnsupportedReasonCode,
  VerifiedCitation
} from "./types.ts";

export {normalizeDocumentIds, primaryDocumentId} from "./multi-ids.ts";

export interface MultiDocPipelineInput {
  documents: Array<{
    meta: DocumentMeta;
    source: CanonicalSource;
  }>;
  question: string;
  retrieve: (request: RetrievalRequest) => Promise<RetrievalResult>;
  provider: LlmProvider;
  emit: (event: ChatStreamEvent) => void;
  signal?: AbortSignal;
  evidenceCharBudget?: number;
  maxTokens?: number;
}

const GENERABLE = new Set(["MATCHES_FOUND", "PARTIAL_SOURCE"]);

/**
 * Grounded multi-document comparative chat.
 * Retrieves independently per document, builds an isolated evidence registry,
 * synthesises one comparative answer, and verifies each citation against its own source.
 */
export async function runGroundedMultiDocChat(
  input: MultiDocPipelineInput
): Promise<ChatPipelineResult> {
  const {documents, question, retrieve, provider, emit, signal} = input;
  const documentIds = documents.map(d => d.meta.id);

  emit({type: "retrieval_started", documentId: documentIds[0]!, question});

  const retrievals: Array<{
    meta: DocumentMeta;
    source: CanonicalSource;
    retrieval: RetrievalResult;
  }> = [];
  const perDocument: PerDocumentCoverage[] = [];
  const sourcesByDocumentId = new Map<string, CanonicalSource>();

  for (const doc of documents) {
    sourcesByDocumentId.set(doc.meta.id, doc.source);
    let retrieval: RetrievalResult;
    try {
      retrieval = await retrieveForDocument(retrieve, doc.meta.id, question);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Retrieval failed.";
      emit({type: "error", code: "SEARCH_FAILED", message: `${doc.meta.name}: ${message}`});
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
    retrievals.push({meta: doc.meta, source: doc.source, retrieval});
  }

  const prepared = prepareMultiDocumentEvidenceRegistry(
    retrievals.map(r => ({
      documentId: r.meta.id,
      documentName: r.meta.name,
      source: r.source,
      retrieval: r.retrieval
    })),
    {charBudget: input.evidenceCharBudget ?? MULTI_DOC_EVIDENCE_CHAR_BUDGET}
  );

  for (const r of retrievals) {
    perDocument.push({
      documentId: r.meta.id,
      documentName: r.meta.name,
      coverage: r.retrieval.coverage,
      evidenceCount: prepared.countsByDocument[r.meta.id] ?? 0
    });
  }

  const aggregate = aggregateMultiDocCoverage(retrievals.map(r => r.retrieval.coverage));
  const messages = buildMultiDocChatMessages({
    question,
    documents: retrievals.map(r => ({
      documentId: r.meta.id,
      documentName: r.meta.name,
      coverage: r.retrieval.coverage
    })),
    evidence: prepared.items,
    truncated: prepared.truncated
  });
  const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);

  emit({
    type: "evidence_prepared",
    evidence: prepared.items,
    coverage: aggregate,
    truncated: prepared.truncated,
    promptChars,
    perDocument,
    documentIds
  });

  const docsWithEvidence = perDocument.filter(p => p.evidenceCount > 0).length;
  const canGenerate =
    GENERABLE.has(aggregate.status) && prepared.items.length > 0 && docsWithEvidence > 0;

  if (!canGenerate) {
    const answerText = multiInsufficientMessage(aggregate, perDocument);
    emit({type: "answer_delta", text: answerText});
    const completed: ChatPipelineResult = {
      status: "insufficient_evidence",
      answerText,
      citations: [],
      coverageStatus: aggregate.status,
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
      coverageStatus: aggregate.status,
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
      maxTokens: input.maxTokens,
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

  if (providerFailed?.code === "CLIENT_ABORTED") {
    const resolution = resolveCitationsMulti(sourcesByDocumentId, prepared.items, answerText);
    for (const citation of resolution.citations) emit({type: "citation", citation});
    const result: ChatPipelineResult = {
      status: "stopped",
      answerText,
      citations: resolution.citations,
      coverageStatus: aggregate.status,
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
    const result: ChatPipelineResult = {
      status: "failed",
      answerText: answerText.length ? answerText : unsupportedAfterGenerationMessage(),
      citations: [],
      coverageStatus: aggregate.status,
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

  const resolution = resolveCitationsMulti(sourcesByDocumentId, prepared.items, answerText);
  let citations: VerifiedCitation[] = resolution.citations;
  if (!citations.length) {
    citations = findLiteralQuotedEvidenceMulti(sourcesByDocumentId, prepared.items, answerText);
  }
  for (const citation of citations) emit({type: "citation", citation});

  const looksLikeAbstention =
    /insufficient evidence|cannot be established|not established|retrieved material/i.test(answerText);

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
    finalText = answerText.trim() || unsupportedAfterGenerationMessage();
    finalCitations = [];
  }

  const result: ChatPipelineResult = {
    status,
    answerText: finalText,
    citations: finalCitations,
    coverageStatus: aggregate.status,
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

async function retrieveForDocument(
  retrieve: (request: RetrievalRequest) => Promise<RetrievalResult>,
  documentId: string,
  question: string
): Promise<RetrievalResult> {
  const primary = await retrieve({
    documentId,
    query: toRetrievalQuery(question),
    limit: 6,
    mode: "ranked",
    expand: true,
    maxExpandedChars: 2800
  });

  // Extra concept queries help comparison questions that name multiple legal topics.
  const conceptQueries = extractComparisonConcepts(question);
  if (!conceptQueries.length) return primary;

  const merged = new Map<string, (typeof primary.passages)[number]>();
  for (const p of primary.passages) {
    merged.set(`${p.startOffset}:${p.endOffset}`, p);
  }

  for (const concept of conceptQueries.slice(0, 3)) {
    try {
      const extra = await retrieve({
        documentId,
        query: concept,
        limit: 4,
        mode: "ranked",
        expand: true,
        maxExpandedChars: 1800
      });
      for (const p of extra.passages) {
        const key = `${p.startOffset}:${p.endOffset}`;
        if (!merged.has(key)) merged.set(key, p);
      }
    } catch {
      /* keep primary */
    }
  }

  return {
    ...primary,
    passages: [...merged.values()].sort((a, b) => b.score - a.score || a.startOffset - b.startOffset)
  };
}

/** Pull comparison-oriented phrases (termination notice, liability cap, …) from the question. */
export function extractComparisonConcepts(question: string): string[] {
  const q = question.toLowerCase();
  const concepts: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/terminat|notice period|days[’']?\s*notice/, "termination notice"],
    [/liabilit|indemnit|cap|limitation of liability/, "liability cap"],
    [/confidential|non-?disclosure/, "confidentiality"],
    [/governing law|jurisdiction/, "governing law"],
    [/payment|fee|consideration|price/, "payment"]
  ];
  for (const [re, label] of patterns) {
    if (re.test(q)) concepts.push(label);
  }
  return concepts;
}

function multiInsufficientMessage(
  aggregate: RetrievalCoverage,
  perDocument: PerDocumentCoverage[]
): string {
  const gaps = perDocument
    .filter(p => p.evidenceCount === 0)
    .map(p => p.documentName);
  const base = insufficientEvidenceMessage(aggregate);
  if (!gaps.length) return base;
  return (
    `${base} No verified passages were established for: ${gaps.join(", ")}. ` +
    "A search miss is not proof that those contracts omit the provision."
  );
}
