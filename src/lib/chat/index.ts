export {runGroundedChat, toRetrievalQuery, type ChatPipelineDeps, type DocumentMeta} from "./pipeline.ts";
export {prepareEvidenceRegistry, getEvidenceById, DEFAULT_EVIDENCE_CHAR_BUDGET} from "./evidence.ts";
export {extractReferencedEvidenceIds, resolveCitations, findLiteralQuotedEvidence} from "./citations.ts";
export {
  buildChatMessages,
  buildUserPrompt,
  insufficientEvidenceMessage,
  unsupportedAfterGenerationMessage,
  SYSTEM_PROMPT
} from "./prompts.ts";
export {encodeSseEvent, parseSseChunk} from "./sse.ts";
export {
  chatQuestionSchema,
  type ChatQuestionInput,
  type ChatStreamEvent,
  type ChatPipelineResult,
  type EvidenceItem,
  type VerifiedCitation,
  type AnswerStatus,
  type UnsupportedReasonCode
} from "./types.ts";
// Persist modules are imported from `@/lib/chat/persist` to avoid pulling Supabase
// into pure unit-test paths that only need grounding helpers.
