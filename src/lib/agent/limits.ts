/** Server-enforced agent research budgets (not prompt-only). */
export const AGENT_LIMITS = {
  maxRounds: 5,
  maxToolCalls: 10,
  maxIdenticalToolCalls: 2,
  maxDocuments: 5,
  minDocuments: 1,
  maxToolResultChars: 6_000,
  maxSearchResults: 6,
  maxSections: 40,
  maxInspectExpandChars: 2_500,
  maxQuestionChars: 2_000,
  maxTotalMs: 55_000,
  maxModelRequests: 8,
  maxPromptCharsApprox: 48_000,
  maxEvidenceItems: 40
} as const;

export type AgentLimitReason =
  | "max_rounds"
  | "max_tool_calls"
  | "max_identical_calls"
  | "timeout"
  | "max_model_requests"
  | "no_progress"
  | "cancelled"
  | "provider_error"
  | "invalid_tools";
