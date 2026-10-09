export {runGroundedChat, toRetrievalQuery, type ChatPipelineDeps, type DocumentMeta} from "./pipeline.ts";
export {runGroundedMultiDocChat, extractComparisonConcepts} from "./multi-pipeline.ts";
export {primaryDocumentId, normalizeDocumentIds} from "./multi-ids.ts";
export {
  prepareEvidenceRegistry,
  prepareMultiDocumentEvidenceRegistry,
  getEvidenceById,
  DEFAULT_EVIDENCE_CHAR_BUDGET,
  MULTI_DOC_EVIDENCE_CHAR_BUDGET
} from "./evidence.ts";
export {
  extractReferencedEvidenceIds,
  resolveCitations,
  resolveCitationsMulti,
  findLiteralQuotedEvidence,
  findLiteralQuotedEvidenceMulti
} from "./citations.ts";
export {
  buildChatMessages,
  buildUserPrompt,
  buildMultiDocChatMessages,
  buildMultiDocUserPrompt,
  aggregateMultiDocCoverage,
  insufficientEvidenceMessage,
  unsupportedAfterGenerationMessage,
  SYSTEM_PROMPT,
  MULTI_DOC_SYSTEM_PROMPT
} from "./prompts.ts";
export {encodeSseEvent, parseSseChunk} from "./sse.ts";
export {
  chatQuestionSchema,
  multiDocChatSchema,
  MULTI_DOC_MIN,
  MULTI_DOC_MAX,
  type ChatQuestionInput,
  type MultiDocChatInput,
  type ChatStreamEvent,
  type ChatPipelineResult,
  type EvidenceItem,
  type VerifiedCitation,
  type AnswerStatus,
  type UnsupportedReasonCode,
  type PerDocumentCoverage
} from "./types.ts";
// Persist modules are imported from `@/lib/chat/persist` to avoid pulling Supabase
// into pure unit-test paths that only need grounding helpers.
