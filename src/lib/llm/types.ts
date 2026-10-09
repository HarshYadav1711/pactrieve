export interface ToolFunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: "function";
  function: ToolFunctionDefinition;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type ChatMessage =
  | {role: "system"; content: string}
  | {role: "user"; content: string}
  | {role: "assistant"; content: string | null; tool_calls?: ToolCall[]}
  | {role: "tool"; tool_call_id: string; content: string};

export interface StreamChatRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export type StreamChatEvent =
  | {kind: "delta"; text: string}
  | {kind: "done"; finishReason: string | null}
  | {kind: "error"; code: string; message: string};

export interface ChatWithToolsRequest {
  messages: ChatMessage[];
  tools: ToolDefinition[];
  toolChoice?: "auto" | "none";
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export type ChatWithToolsResult =
  | {kind: "tool_calls"; content: string | null; toolCalls: ToolCall[]}
  | {kind: "message"; content: string; finishReason: string | null}
  | {kind: "error"; code: string; message: string};

export interface LlmProvider {
  streamChat(request: StreamChatRequest): AsyncIterable<StreamChatEvent>;
  /** Non-streaming tool-call turn. Optional on legacy fakes; agent requires it. */
  chatWithTools?(request: ChatWithToolsRequest): Promise<ChatWithToolsResult>;
}
