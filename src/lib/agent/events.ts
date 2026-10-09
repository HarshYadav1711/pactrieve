import type {AnswerStatus, VerifiedCitation} from "../chat/types.ts";
import type {CoverageStatus} from "../retrieval/types.ts";
import type {AgentLimitReason} from "./limits.ts";

/** SSE events for Agent Research — only emit real actions. */
export type AgentStreamEvent =
  | {
      type: "session";
      conversationId: string;
      userMessageId: string;
      assistantMessageId: string;
    }
  | {type: "research_started"; documentIds: string[]; question: string}
  | {type: "activity"; id: string; phase: string; detail: string; at: number}
  | {
      type: "tool_call";
      id: string;
      toolCallId: string;
      name: string;
      argsPreview: string;
    }
  | {
      type: "tool_result";
      id: string;
      toolCallId: string;
      name: string;
      ok: boolean;
      detail: string;
    }
  | {
      type: "evidence_prepared";
      evidenceCount: number;
      evidence: Array<{
        id: string;
        documentId: string;
        documentName?: string;
        quote: string;
        startOffset: number;
        endOffset: number;
        pageIndices: number[];
        sectionLabel: string | null;
      }>;
    }
  | {type: "generation_started"}
  | {type: "answer_delta"; text: string}
  | {type: "citation"; citation: VerifiedCitation}
  | {
      type: "completed";
      status: AnswerStatus;
      answerText: string;
      citations: VerifiedCitation[];
      coverageStatus: CoverageStatus;
      rejectedEvidenceIds: string[];
      replacedProvisional: boolean;
      limitReason?: AgentLimitReason;
      rounds: number;
      toolCalls: number;
      modelRequests: number;
      conversationId?: string;
      assistantMessageId?: string;
      persistedStatus?: "complete" | "stopped" | "failed" | "interrupted";
      persistenceOk?: boolean;
    }
  | {type: "error"; code: string; message: string};

export function encodeAgentSseEvent(event: AgentStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
