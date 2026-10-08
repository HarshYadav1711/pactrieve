/**
 * Incremental SSE / OpenAI-compatible stream parser.
 * Handles fragmented TCP chunks and multibyte UTF-8 boundaries via TextDecoder.
 */

export interface ParsedSseFrame {
  event: string | null;
  data: string;
}

/**
 * Feed arbitrary string chunks (already decoded as UTF-8 text) and yield complete SSE frames.
 * Frames are separated by a blank line (`\n\n` or `\r\n\r\n`).
 */
export function createSseFrameParser() {
  let buffer = "";

  function push(chunk: string): ParsedSseFrame[] {
    buffer += chunk;
    const frames: ParsedSseFrame[] = [];
    // Normalize lone CR to LF for simpler splitting, preserve CRLF pairs as LF.
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const raw = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const frame = parseFrame(raw);
      if (frame) frames.push(frame);
      separator = buffer.indexOf("\n\n");
    }
    return frames;
  }

  function flush(): ParsedSseFrame[] {
    if (!buffer.trim()) {
      buffer = "";
      return [];
    }
    const frame = parseFrame(buffer);
    buffer = "";
    return frame ? [frame] : [];
  }

  return {push, flush};
}

function parseFrame(raw: string): ParsedSseFrame | null {
  if (!raw.trim() || raw.startsWith(":")) return null;
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) return null;
  return {event, data: dataLines.join("\n")};
}

/**
 * Extract assistant text deltas from an OpenAI-compatible chat.completion.chunk JSON payload.
 * Returns null when the frame is a keep-alive / role-only / empty delta.
 */
export function extractOpenAiDeltaText(data: string): {text: string | null; done: boolean; finishReason: string | null} {
  if (data === "[DONE]") return {text: null, done: true, finishReason: "stop"};
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error("MALFORMED_PROVIDER_JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("MALFORMED_PROVIDER_JSON");
  }
  const obj = parsed as {
    choices?: Array<{
      delta?: {content?: string | null; role?: string};
      finish_reason?: string | null;
      text?: string;
    }>;
    error?: {message?: string; code?: string};
  };
  if (obj.error) {
    throw new Error(obj.error.message || "PROVIDER_ERROR");
  }
  const choice = Array.isArray(obj.choices) ? obj.choices[0] : undefined;
  if (!choice) return {text: null, done: false, finishReason: null};
  const finishReason = choice.finish_reason ?? null;
  const deltaText =
    typeof choice.delta?.content === "string" ? choice.delta.content
    : typeof choice.text === "string" ? choice.text
    : null;
  return {
    text: deltaText && deltaText.length ? deltaText : null,
    done: finishReason !== null,
    finishReason
  };
}
