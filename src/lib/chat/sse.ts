import type {ChatStreamEvent} from "./types.ts";

/** Encode a typed chat event as an SSE frame. */
export function encodeSseEvent(event: ChatStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Parse SSE frames from a text buffer (client-side incremental parser).
 * Returns completed events and residual buffer.
 */
export function parseSseChunk(
  buffer: string,
  chunk: string
): {events: ChatStreamEvent[]; rest: string} {
  let combined = (buffer + chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const events: ChatStreamEvent[] = [];
  let sep = combined.indexOf("\n\n");
  while (sep >= 0) {
    const raw = combined.slice(0, sep);
    combined = combined.slice(sep + 2);
    const parsed = parseOne(raw);
    if (parsed) events.push(parsed);
    sep = combined.indexOf("\n\n");
  }
  return {events, rest: combined};
}

function parseOne(raw: string): ChatStreamEvent | null {
  if (!raw.trim() || raw.startsWith(":")) return null;
  let eventName: string | null = null;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  try {
    const data = JSON.parse(dataLines.join("\n")) as ChatStreamEvent;
    if (!data || typeof data !== "object" || typeof (data as {type?: unknown}).type !== "string") {
      return null;
    }
    if (eventName && data.type !== eventName) {
      // Prefer payload type; event name is advisory.
    }
    return data;
  } catch {
    return null;
  }
}
