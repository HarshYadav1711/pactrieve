import type {
  ChatWithToolsRequest,
  ChatWithToolsResult,
  LlmProvider,
  StreamChatEvent,
  StreamChatRequest,
  ToolCall
} from "./types.ts";

export type ScriptedToolTurn =
  | {kind: "tool_calls"; toolCalls: Array<{name: string; arguments: Record<string, unknown> | string}>}
  | {kind: "message"; content: string}
  | {kind: "error"; code: string; message: string};

/**
 * Deterministic provider for agent orchestration tests.
 * Each chatWithTools call consumes the next scripted turn.
 * streamChat emits the final answer script.
 */
export function createAgentScriptedProvider(options: {
  toolTurns: ScriptedToolTurn[];
  finalChunks?: string[];
  onToolTurn?: (request: ChatWithToolsRequest, turnIndex: number) => void;
}): LlmProvider {
  let toolIndex = 0;
  let callSeq = 0;

  return {
    async chatWithTools(request: ChatWithToolsRequest): Promise<ChatWithToolsResult> {
      if (request.signal?.aborted) {
        return {kind: "error", code: "CLIENT_ABORTED", message: "Request was cancelled."};
      }
      const turn = options.toolTurns[toolIndex];
      options.onToolTurn?.(request, toolIndex);
      toolIndex += 1;
      if (!turn) {
        return {kind: "message", content: "", finishReason: "stop"};
      }
      if (turn.kind === "error") {
        return {kind: "error", code: turn.code, message: turn.message};
      }
      if (turn.kind === "message") {
        return {kind: "message", content: turn.content, finishReason: "stop"};
      }
      const toolCalls: ToolCall[] = turn.toolCalls.map((c, i) => {
        callSeq += 1;
        return {
          id: `call_test_${callSeq}_${i}`,
          type: "function",
          function: {
            name: c.name,
            arguments: typeof c.arguments === "string" ? c.arguments : JSON.stringify(c.arguments)
          }
        };
      });
      return {kind: "tool_calls", content: null, toolCalls};
    },

    async *streamChat(request: StreamChatRequest): AsyncIterable<StreamChatEvent> {
      if (request.signal?.aborted) {
        yield {kind: "error", code: "CLIENT_ABORTED", message: "Request was cancelled."};
        return;
      }
      for (const chunk of options.finalChunks ?? ["Answer with [e1]."]) {
        if (request.signal?.aborted) {
          yield {kind: "error", code: "CLIENT_ABORTED", message: "Request was cancelled."};
          return;
        }
        yield {kind: "delta", text: chunk};
      }
      yield {kind: "done", finishReason: "stop"};
    }
  };
}
