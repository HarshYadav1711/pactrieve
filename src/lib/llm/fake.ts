import type {LlmProvider, StreamChatEvent, StreamChatRequest} from "./types.ts";

export type FakeProviderBehaviour =
  | {mode: "stream"; chunks: string[]; delayMs?: number}
  | {mode: "timeout"; delayMs?: number}
  | {mode: "malformed"}
  | {mode: "error"; code: string; message: string};

/**
 * Deterministic streaming provider for unit/integration tests.
 * Does not contact the network.
 */
export function createFakeProvider(behaviour: FakeProviderBehaviour): LlmProvider {
  return {
    async *streamChat(request: StreamChatRequest): AsyncIterable<StreamChatEvent> {
      if (request.signal?.aborted) {
        yield {kind: "error", code: "CLIENT_ABORTED", message: "Request was cancelled."};
        return;
      }

      if (behaviour.mode === "timeout") {
        const delay = behaviour.delayMs ?? 30;
        await sleep(delay, request.signal);
        if (request.signal?.aborted) {
          yield {kind: "error", code: "CLIENT_ABORTED", message: "Request was cancelled."};
          return;
        }
        yield {kind: "error", code: "PROVIDER_TIMEOUT", message: "LLM provider timed out."};
        return;
      }

      if (behaviour.mode === "malformed") {
        yield {kind: "error", code: "PROVIDER_MALFORMED", message: "MALFORMED_PROVIDER_JSON"};
        return;
      }

      if (behaviour.mode === "error") {
        yield {kind: "error", code: behaviour.code, message: behaviour.message};
        return;
      }

      for (const chunk of behaviour.chunks) {
        if (request.signal?.aborted) {
          yield {kind: "error", code: "CLIENT_ABORTED", message: "Request was cancelled."};
          return;
        }
        if (behaviour.delayMs) await sleep(behaviour.delayMs, request.signal);
        yield {kind: "delta", text: chunk};
      }
      yield {kind: "done", finishReason: "stop"};
    }
  };
}

/** Scripted provider that inspects the last user message (for prompt-injection tests). */
export function createScriptedProvider(
  handler: (request: StreamChatRequest) => FakeProviderBehaviour
): LlmProvider {
  return {
    async *streamChat(request: StreamChatRequest): AsyncIterable<StreamChatEvent> {
      const inner = createFakeProvider(handler(request));
      yield* inner.streamChat(request);
    }
  };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, {once: true});
  });
}
