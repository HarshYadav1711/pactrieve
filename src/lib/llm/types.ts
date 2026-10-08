export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

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

export interface LlmProvider {
  streamChat(request: StreamChatRequest): AsyncIterable<StreamChatEvent>;
}
