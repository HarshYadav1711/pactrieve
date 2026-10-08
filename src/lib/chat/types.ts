import {z} from "zod";
import type {CoverageStatus, RetrievalCoverage} from "../retrieval/types.ts";

export const chatQuestionSchema = z.object({
  question: z.string().trim().min(1, "Question cannot be empty.").max(2000, "Question exceeds 2,000 characters."),
  conversationId: z.string().uuid().optional()
});

export type ChatQuestionInput = z.infer<typeof chatQuestionSchema>;

export interface EvidenceItem {
  id: string;
  documentId: string;
  quote: string;
  startOffset: number;
  endOffset: number;
  pageIndices: number[];
  sectionLabel: string | null;
  occurrenceIndex: number;
}

export interface VerifiedCitation {
  evidenceId: string;
  documentId: string;
  quote: string;
  startOffset: number;
  endOffset: number;
  pageIndices: number[];
  sectionLabel: string | null;
  occurrenceIndex: number;
  /** Literal match succeeded; does NOT prove the answer's interpretation is entailed. */
  verified: true;
}

export type AnswerStatus =
  | "answered"
  | "insufficient_evidence"
  | "failed"
  | "stopped";

/** Machine-readable reason for engineering diagnostics (not end-user prose). */
export type UnsupportedReasonCode =
  | "RETRIEVAL_INSUFFICIENT"
  | "NO_VERIFIED_CITATIONS"
  | "REJECTED_EVIDENCE_IDS"
  | "PROVIDER_FAILED";

export type ChatStreamEvent =
  | {type: "retrieval_started"; documentId: string; question: string}
  | {
      type: "session";
      conversationId: string;
      userMessageId: string;
      assistantMessageId: string;
    }
  | {
      type: "evidence_prepared";
      evidence: EvidenceItem[];
      coverage: RetrievalCoverage;
      truncated: boolean;
      promptChars: number;
    }
  | {type: "generation_started"; assistantMessageId?: string}
  | {type: "answer_delta"; text: string}
  | {type: "citation"; citation: VerifiedCitation}
  | {
      type: "completed";
      status: AnswerStatus;
      answerText: string;
      citations: VerifiedCitation[];
      coverageStatus: CoverageStatus;
      rejectedEvidenceIds: string[];
      provisional: boolean;
      /** True when streamed provisional answer text was replaced by the final verified/insufficient payload. */
      replacedProvisional: boolean;
      reasonCode?: UnsupportedReasonCode;
      conversationId?: string;
      assistantMessageId?: string;
      persistedStatus?: "complete" | "stopped" | "failed" | "interrupted";
      persistenceOk?: boolean;
    }
  | {type: "error"; code: string; message: string};

export interface ChatPipelineResult {
  status: AnswerStatus;
  answerText: string;
  citations: VerifiedCitation[];
  coverageStatus: CoverageStatus;
  rejectedEvidenceIds: string[];
  evidenceCount: number;
  promptChars: number;
  truncated: boolean;
  replacedProvisional: boolean;
  reasonCode?: UnsupportedReasonCode;
  /** Provisional model draft retained for diagnostics only — never treat as verified answer. */
  modelDraft?: string;
}
