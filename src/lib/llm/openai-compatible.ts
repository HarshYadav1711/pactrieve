import type {LlmConfig} from "./config.ts";
import {createSseFrameParser, extractOpenAiDeltaText} from "./sse-parse.ts";
import type {
  ChatWithToolsRequest,
  ChatWithToolsResult,
  LlmProvider,
  StreamChatEvent,
  StreamChatRequest,
  ToolCall
} from "./types.ts";

export class ProviderError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ProviderError";
  }
}

/**
 * OpenAI-compatible chat Completions client (Groq / OpenRouter / OpenAI / etc.).
 * Uses native fetch. No SDK dependency.
 * Tool rounds use non-streaming JSON; final answers may still stream via streamChat.
 */
export function createOpenAiCompatibleProvider(config: LlmConfig): LlmProvider {
  return {
    async chatWithTools(request: ChatWithToolsRequest): Promise<ChatWithToolsResult> {
      const url = `${config.baseUrl}/chat/completions`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      const onAbort = () => controller.abort();
      if (request.signal) {
        if (request.signal.aborted) controller.abort();
        else request.signal.addEventListener("abort", onAbort, {once: true});
      }

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.model,
            stream: false,
            temperature: request.temperature ?? 0,
            max_tokens: request.maxTokens ?? config.maxTokens,
            messages: request.messages,
            tools: request.tools,
            tool_choice: request.toolChoice ?? "auto"
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          let detail = "";
          try {
            detail = (await response.text()).slice(0, 400);
          } catch {
            /* ignore */
          }
          const sanitized = detail.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]");
          return {
            kind: "error",
            code: response.status === 401 || response.status === 403 ? "PROVIDER_AUTH" : "PROVIDER_HTTP",
            message: `LLM provider returned HTTP ${response.status}${sanitized ? `: ${sanitized}` : "."}`
          };
        }

        const body = (await response.json()) as {
          choices?: Array<{
            message?: {
              content?: string | null;
              tool_calls?: Array<{
                id?: string;
                type?: string;
                function?: {name?: string; arguments?: string};
              }>;
            };
            finish_reason?: string | null;
          }>;
          error?: {message?: string};
        };

        if (body.error?.message) {
          return {kind: "error", code: "PROVIDER_ERROR", message: body.error.message};
        }

        const choice = body.choices?.[0];
        const message = choice?.message;
        if (!message) {
          return {kind: "error", code: "PROVIDER_MALFORMED", message: "Provider returned no choices."};
        }

        const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
        if (rawCalls.length) {
          const toolCalls: ToolCall[] = [];
          for (const call of rawCalls) {
            const id = typeof call.id === "string" && call.id ? call.id : `call_${toolCalls.length}`;
            const name = call.function?.name;
            const args = call.function?.arguments ?? "{}";
            if (typeof name !== "string" || !name) {
              return {kind: "error", code: "PROVIDER_MALFORMED", message: "Tool call missing function name."};
            }
            toolCalls.push({
              id,
              type: "function",
              function: {name, arguments: typeof args === "string" ? args : JSON.stringify(args)}
            });
          }
          return {
            kind: "tool_calls",
            content: typeof message.content === "string" ? message.content : null,
            toolCalls
          };
        }

        return {
          kind: "message",
          content: typeof message.content === "string" ? message.content : "",
          finishReason: choice?.finish_reason ?? "stop"
        };
      } catch (error) {
        if (controller.signal.aborted) {
          return {
            kind: "error",
            code: request.signal?.aborted ? "CLIENT_ABORTED" : "PROVIDER_TIMEOUT",
            message: request.signal?.aborted
              ? "Request was cancelled."
              : `LLM provider timed out after ${config.timeoutMs}ms.`
          };
        }
        return {
          kind: "error",
          code: "PROVIDER_NETWORK",
          message: error instanceof Error ? error.message : "Network error contacting LLM provider."
        };
      } finally {
        clearTimeout(timeout);
        if (request.signal) request.signal.removeEventListener("abort", onAbort);
      }
    },

    async *streamChat(request: StreamChatRequest): AsyncIterable<StreamChatEvent> {
      const url = `${config.baseUrl}/chat/completions`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      const onAbort = () => controller.abort();
      if (request.signal) {
        if (request.signal.aborted) controller.abort();
        else request.signal.addEventListener("abort", onAbort, {once: true});
      }

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "text/event-stream"
          },
          body: JSON.stringify({
            model: config.model,
            stream: true,
            temperature: request.temperature ?? 0,
            max_tokens: request.maxTokens ?? config.maxTokens,
            messages: request.messages
          }),
          signal: controller.signal
        });
      } catch (error) {
        clearTimeout(timeout);
        if (request.signal) request.signal.removeEventListener("abort", onAbort);
        if (controller.signal.aborted) {
          yield {
            kind: "error",
            code: request.signal?.aborted ? "CLIENT_ABORTED" : "PROVIDER_TIMEOUT",
            message: request.signal?.aborted
              ? "Request was cancelled."
              : `LLM provider timed out after ${config.timeoutMs}ms.`
          };
          return;
        }
        yield {
          kind: "error",
          code: "PROVIDER_NETWORK",
          message: error instanceof Error ? error.message : "Network error contacting LLM provider."
        };
        return;
      }

      if (!response.ok || !response.body) {
        clearTimeout(timeout);
        if (request.signal) request.signal.removeEventListener("abort", onAbort);
        let detail = "";
        try { detail = (await response.text()).slice(0, 400); } catch { /* ignore */ }
        // Never echo Authorization / API key material — truncate body only.
        const sanitized = detail.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]");
        yield {
          kind: "error",
          code: response.status === 401 || response.status === 403 ? "PROVIDER_AUTH" : "PROVIDER_HTTP",
          message: `LLM provider returned HTTP ${response.status}${sanitized ? `: ${sanitized}` : "."}`
        };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      const parser = createSseFrameParser();
      let finished = false;

      try {
        while (!finished) {
          const {done, value} = await reader.read();
          if (done) break;
          const text = decoder.decode(value, {stream: true});
          for (const frame of parser.push(text)) {
            try {
              const extracted = extractOpenAiDeltaText(frame.data);
              if (extracted.text) yield {kind: "delta", text: extracted.text};
              if (extracted.done) {
                finished = true;
                yield {kind: "done", finishReason: extracted.finishReason};
                break;
              }
            } catch (error) {
              yield {
                kind: "error",
                code: "PROVIDER_MALFORMED",
                message: error instanceof Error ? error.message : "Malformed provider stream frame."
              };
              return;
            }
          }
        }
        // Flush decoder + residual frame buffer.
        const tail = decoder.decode();
        if (tail) {
          for (const frame of parser.push(tail)) {
            try {
              const extracted = extractOpenAiDeltaText(frame.data);
              if (extracted.text) yield {kind: "delta", text: extracted.text};
              if (extracted.done) {
                finished = true;
                yield {kind: "done", finishReason: extracted.finishReason};
              }
            } catch (error) {
              yield {
                kind: "error",
                code: "PROVIDER_MALFORMED",
                message: error instanceof Error ? error.message : "Malformed provider stream frame."
              };
              return;
            }
          }
        }
        for (const frame of parser.flush()) {
          try {
            const extracted = extractOpenAiDeltaText(frame.data);
            if (extracted.text) yield {kind: "delta", text: extracted.text};
            if (extracted.done) {
              finished = true;
              yield {kind: "done", finishReason: extracted.finishReason};
            }
          } catch (error) {
            yield {
              kind: "error",
              code: "PROVIDER_MALFORMED",
              message: error instanceof Error ? error.message : "Malformed provider stream frame."
            };
            return;
          }
        }
        if (!finished) yield {kind: "done", finishReason: null};
      } finally {
        clearTimeout(timeout);
        if (request.signal) request.signal.removeEventListener("abort", onAbort);
        try { await reader.cancel(); } catch { /* ignore */ }
      }
    }
  };
}
