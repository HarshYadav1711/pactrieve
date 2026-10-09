import type {CanonicalSource} from "../evidence/verify.ts";
import {resolveCitationsMulti} from "../chat/citations.ts";
import type {AnswerStatus, VerifiedCitation} from "../chat/types.ts";
import type {CoverageStatus} from "../retrieval/types.ts";
import type {ChatMessage, LlmProvider, ToolCall} from "../llm/types.ts";
import type {RetrievalRequest, RetrievalResult} from "../retrieval/types.ts";
import {dispatchAgentTool} from "./dispatch.ts";
import {createAgentEvidenceRegistry} from "./evidence.ts";
import type {AgentStreamEvent} from "./events.ts";
import {AGENT_LIMITS, type AgentLimitReason} from "./limits.ts";
import {
  agentInsufficientMessage,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  buildFinalAnswerMessages
} from "./prompts.ts";
import {
  agentToolDefinitions,
  isRegisteredToolName,
  parseToolArgs,
  toolCallFingerprint
} from "./tools.ts";

export interface AgentOrchestrateInput {
  documents: Array<{
    id: string;
    name: string;
    source: CanonicalSource;
  }>;
  question: string;
  retrieve: (request: RetrievalRequest) => Promise<RetrievalResult>;
  provider: LlmProvider;
  emit: (event: AgentStreamEvent) => void;
  signal?: AbortSignal;
  maxTokens?: number;
}

export interface AgentOrchestrateResult {
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
  evidenceCount: number;
}

/**
 * Bounded multi-round agentic research.
 * Tool selection comes from the model; the server validates and executes.
 */
export async function runAgentResearch(
  input: AgentOrchestrateInput
): Promise<AgentOrchestrateResult> {
  const {documents, question, retrieve, provider, emit, signal} = input;
  const started = Date.now();
  const permittedDocumentIds = documents.map(d => d.id);
  const registry = createAgentEvidenceRegistry(
    documents.map(d => ({id: d.id, name: d.name, source: d.source}))
  );
  const sourcesByDocumentId = new Map(documents.map(d => [d.id, d.source]));

  if (!provider.chatWithTools) {
    emit({
      type: "error",
      code: "TOOLS_UNSUPPORTED",
      message: "Configured LLM provider does not support tool calling."
    });
    return failed("PROVIDER_FAILED");
  }

  emit({
    type: "research_started",
    documentIds: permittedDocumentIds,
    question
  });
  activity(emit, "started", "Agent research started.");

  const messages: ChatMessage[] = [
    {role: "system", content: buildAgentSystemPrompt(documents.map(d => ({id: d.id, name: d.name})))},
    {role: "user", content: buildAgentUserPrompt(question)}
  ];

  const tools = agentToolDefinitions();
  const fingerprints = new Map<string, number>();
  const researchNotes: string[] = [];
  let rounds = 0;
  let toolCalls = 0;
  let modelRequests = 0;
  let limitReason: AgentLimitReason | undefined;
  let consecutiveInvalid = 0;

  while (rounds < AGENT_LIMITS.maxRounds) {
    if (signal?.aborted) {
      limitReason = "cancelled";
      break;
    }
    if (Date.now() - started > AGENT_LIMITS.maxTotalMs) {
      limitReason = "timeout";
      break;
    }
    if (modelRequests >= AGENT_LIMITS.maxModelRequests) {
      limitReason = "max_model_requests";
      break;
    }
    if (toolCalls >= AGENT_LIMITS.maxToolCalls) {
      limitReason = "max_tool_calls";
      break;
    }

    rounds += 1;
    modelRequests += 1;
    activity(emit, "model_turn", `Research round ${rounds}: requesting next model action.`);

    const turn = await provider.chatWithTools!({
      messages,
      tools,
      toolChoice: "auto",
      maxTokens: input.maxTokens,
      temperature: 0,
      signal
    });

    if (turn.kind === "error") {
      if (turn.code === "CLIENT_ABORTED") {
        limitReason = "cancelled";
        break;
      }
      emit({type: "error", code: turn.code, message: turn.message});
      limitReason = "provider_error";
      break;
    }

    if (turn.kind === "message") {
      // Model chose to answer without further tools — still run verified final synthesis
      // using accumulated evidence for citation integrity.
      researchNotes.push("Model concluded tool use; synthesizing grounded final answer.");
      break;
    }

    // tool_calls
    const calls = turn.toolCalls;
    messages.push({
      role: "assistant",
      content: turn.content,
      tool_calls: calls
    });

    if (!calls.length) {
      limitReason = "no_progress";
      break;
    }

    let anyValid = false;
    for (const call of calls) {
      if (signal?.aborted) {
        limitReason = "cancelled";
        break;
      }
      if (toolCalls >= AGENT_LIMITS.maxToolCalls) {
        limitReason = "max_tool_calls";
        break;
      }

      const handled = await handleOneToolCall({
        call,
        emit,
        fingerprints,
        permittedDocumentIds,
        documents,
        registry,
        retrieve,
        messages
      });
      toolCalls += 1;
      if (handled.ok) {
        anyValid = true;
        consecutiveInvalid = 0;
        researchNotes.push(handled.detail);
      } else {
        consecutiveInvalid += 1;
        researchNotes.push(`Tool error: ${handled.detail}`);
        if (consecutiveInvalid >= 3) {
          limitReason = "invalid_tools";
          break;
        }
      }

      const fp = toolCallFingerprint(call.function.name, call.function.arguments);
      const count = fingerprints.get(fp) ?? 0;
      if (count >= AGENT_LIMITS.maxIdenticalToolCalls) {
        limitReason = "max_identical_calls";
        break;
      }
    }

    if (limitReason) break;
    if (!anyValid && consecutiveInvalid >= 3) {
      limitReason = "invalid_tools";
      break;
    }
  }

  if (!limitReason && rounds >= AGENT_LIMITS.maxRounds) {
    limitReason = "max_rounds";
  }

  // Emit evidence snapshot before final answer.
  emit({
    type: "evidence_prepared",
    evidenceCount: registry.evidence.length,
    evidence: registry.evidence.map(e => ({
      id: e.id,
      documentId: e.documentId,
      documentName: e.documentName,
      quote: e.quote,
      startOffset: e.startOffset,
      endOffset: e.endOffset,
      pageIndices: e.pageIndices,
      sectionLabel: e.sectionLabel
    }))
  });

  if (signal?.aborted) {
    const text = agentInsufficientMessage("Research was stopped before a final answer was completed.");
    emitCompleted(emit, {
      status: "stopped",
      answerText: text,
      citations: [],
      coverageStatus: registry.evidence.length ? "MATCHES_FOUND" : "NO_MATCH_ESTABLISHED",
      rejectedEvidenceIds: [],
      replacedProvisional: false,
      limitReason: "cancelled",
      rounds,
      toolCalls,
      modelRequests
    });
    return {
      status: "stopped",
      answerText: text,
      citations: [],
      coverageStatus: registry.evidence.length ? "MATCHES_FOUND" : "NO_MATCH_ESTABLISHED",
      rejectedEvidenceIds: [],
      replacedProvisional: false,
      limitReason: "cancelled",
      rounds,
      toolCalls,
      modelRequests,
      evidenceCount: registry.evidence.length
    };
  }

  activity(emit, "synthesize", "Preparing final grounded answer from collected evidence.");
  emit({type: "generation_started"});

  let answerText = "";
  let replacedProvisional = false;

  if (!registry.evidence.length) {
    answerText = agentInsufficientMessage(
      limitReason
        ? `Research ended (${limitReason}) without verified passages.`
        : "No searchable evidence was gathered."
    );
    emit({type: "answer_delta", text: answerText});
    emitCompleted(emit, {
      status: "insufficient_evidence",
      answerText,
      citations: [],
      coverageStatus: "NO_MATCH_ESTABLISHED",
      rejectedEvidenceIds: [],
      replacedProvisional: false,
      limitReason,
      rounds,
      toolCalls,
      modelRequests
    });
    return {
      status: "insufficient_evidence",
      answerText,
      citations: [],
      coverageStatus: "NO_MATCH_ESTABLISHED",
      rejectedEvidenceIds: [],
      replacedProvisional: false,
      limitReason,
      rounds,
      toolCalls,
      modelRequests,
      evidenceCount: 0
    };
  }

  // Final answer: stream when possible.
  modelRequests += 1;
  const finalMessages = buildFinalAnswerMessages({
    documents: documents.map(d => ({id: d.id, name: d.name})),
    question,
    evidence: registry.evidence,
    researchNotes: researchNotes.slice(-12)
  });

  try {
    for await (const event of provider.streamChat({
      messages: finalMessages,
      maxTokens: input.maxTokens,
      temperature: 0,
      signal
    })) {
      if (event.kind === "error") {
        if (event.code === "CLIENT_ABORTED") {
          limitReason = "cancelled";
          break;
        }
        emit({type: "error", code: event.code, message: event.message});
        answerText = agentInsufficientMessage(event.message);
        replacedProvisional = true;
        break;
      }
      if (event.kind === "delta" && event.text) {
        answerText += event.text;
        emit({type: "answer_delta", text: event.text});
      }
    }
  } catch (error) {
    answerText = agentInsufficientMessage(
      error instanceof Error ? error.message : "Final generation failed."
    );
    replacedProvisional = true;
  }

  if (signal?.aborted && !answerText.trim()) {
    answerText = agentInsufficientMessage("Stopped during final answer generation.");
  }

  const resolved = resolveCitationsMulti(sourcesByDocumentId, registry.evidence, answerText);
  let status: AnswerStatus = "answered";
  let coverageStatus: CoverageStatus = "MATCHES_FOUND";

  if (!resolved.citations.length || resolved.hasUnsupportedCitations) {
    if (!resolved.citations.length) {
      const insufficient = agentInsufficientMessage(
        "The draft answer did not include independently verifiable citations from the gathered evidence."
      );
      if (answerText.trim()) replacedProvisional = true;
      answerText = insufficient;
      status = "insufficient_evidence";
      coverageStatus = "NO_MATCH_ESTABLISHED";
      emit({type: "answer_delta", text: replacedProvisional ? `\n\n${insufficient}` : insufficient});
    }
  }

  if (limitReason && status === "answered") {
    researchNotes.push(`Research stopped under limit: ${limitReason}.`);
  }

  if (limitReason === "cancelled") status = "stopped";

  for (const citation of resolved.citations) {
    emit({type: "citation", citation});
  }

  emitCompleted(emit, {
    status,
    answerText,
    citations: resolved.citations,
    coverageStatus,
    rejectedEvidenceIds: resolved.rejectedEvidenceIds,
    replacedProvisional,
    limitReason,
    rounds,
    toolCalls,
    modelRequests
  });

  return {
    status,
    answerText,
    citations: resolved.citations,
    coverageStatus,
    rejectedEvidenceIds: resolved.rejectedEvidenceIds,
    replacedProvisional,
    limitReason,
    rounds,
    toolCalls,
    modelRequests,
    evidenceCount: registry.evidence.length
  };
}

async function handleOneToolCall(input: {
  call: ToolCall;
  emit: (e: AgentStreamEvent) => void;
  fingerprints: Map<string, number>;
  permittedDocumentIds: string[];
  documents: Array<{id: string; name: string; source: CanonicalSource}>;
  registry: ReturnType<typeof createAgentEvidenceRegistry>;
  retrieve: (request: RetrievalRequest) => Promise<RetrievalResult>;
  messages: ChatMessage[];
}): Promise<{ok: boolean; detail: string}> {
  const {call, emit} = input;
  const argsPreview = call.function.arguments.slice(0, 180);
  emit({
    type: "tool_call",
    id: `act_${call.id}`,
    toolCallId: call.id,
    name: call.function.name,
    argsPreview
  });

  if (!isRegisteredToolName(call.function.name)) {
    const detail = `Unknown tool "${call.function.name}" rejected.`;
    const payload = {error: detail};
    input.messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(payload)
    });
    emit({
      type: "tool_result",
      id: `res_${call.id}`,
      toolCallId: call.id,
      name: call.function.name,
      ok: false,
      detail
    });
    return {ok: false, detail};
  }

  const fp = toolCallFingerprint(call.function.name, call.function.arguments);
  const prior = input.fingerprints.get(fp) ?? 0;
  if (prior >= AGENT_LIMITS.maxIdenticalToolCalls) {
    const detail = "Identical tool call repeated too many times.";
    input.messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify({error: detail})
    });
    emit({
      type: "tool_result",
      id: `res_${call.id}`,
      toolCallId: call.id,
      name: call.function.name,
      ok: false,
      detail
    });
    return {ok: false, detail};
  }
  input.fingerprints.set(fp, prior + 1);

  const parsed = parseToolArgs(call.function.name, call.function.arguments);
  if (!parsed.ok) {
    input.messages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify({error: parsed.error})
    });
    emit({
      type: "tool_result",
      id: `res_${call.id}`,
      toolCallId: call.id,
      name: call.function.name,
      ok: false,
      detail: parsed.error
    });
    return {ok: false, detail: parsed.error};
  }

  const result = await dispatchAgentTool({
    name: call.function.name,
    args: parsed.args,
    permittedDocumentIds: input.permittedDocumentIds,
    documents: input.documents.map(d => ({id: d.id, name: d.name})),
    registry: input.registry,
    retrieve: input.retrieve
  });

  input.messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify(result.payload)
  });
  emit({
    type: "tool_result",
    id: `res_${call.id}`,
    toolCallId: call.id,
    name: call.function.name,
    ok: result.ok,
    detail: result.activityDetail
  });
  activity(emit, "tool", result.activityDetail);
  return {ok: result.ok, detail: result.activityDetail};
}

function activity(
  emit: (e: AgentStreamEvent) => void,
  phase: string,
  detail: string
) {
  emit({
    type: "activity",
    id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    phase,
    detail,
    at: Date.now()
  });
}

function emitCompleted(
  emit: (e: AgentStreamEvent) => void,
  payload: Omit<Extract<AgentStreamEvent, {type: "completed"}>, "type">
) {
  emit({type: "completed", ...payload});
}

function failed(code: string): AgentOrchestrateResult {
  void code;
  return {
    status: "failed",
    answerText: "",
    citations: [],
    coverageStatus: "SEARCH_FAILED",
    rejectedEvidenceIds: [],
    replacedProvisional: false,
    limitReason: "provider_error",
    rounds: 0,
    toolCalls: 0,
    modelRequests: 0,
    evidenceCount: 0
  };
}
