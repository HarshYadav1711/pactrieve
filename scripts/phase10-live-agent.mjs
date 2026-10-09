/**
 * Phase 10 live agent research (requires app + Supabase + Groq tool calling).
 */
import {readFileSync} from "node:fs";

const root = new URL("..", import.meta.url);
try {
  for (const line of readFileSync(new URL(".env.local", root), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  /* optional */
}

const base = process.env.PHASE10_BASE_URL || "http://localhost:3000";
const docs = (await (await fetch(`${base}/api/documents`)).json()).documents.filter(d => d.status === "ready");
const alpha = docs.find(d => /phase7-alpha/i.test(d.name));
const beta = docs.find(d => /phase7-beta/i.test(d.name));
if (!alpha || !beta) {
  console.error("Need phase7-alpha and phase7-beta.");
  process.exit(2);
}

const question =
  "Compare the liability caps and their exceptions, then explain which contract requires longer termination notice. Cite the relevant provisions.";

const t0 = Date.now();
const res = await fetch(`${base}/api/agent/research`, {
  method: "POST",
  headers: {"Content-Type": "application/json", Accept: "text/event-stream"},
  body: JSON.stringify({
    documentIds: [alpha.id, beta.id],
    question
  })
});

if (!res.ok || !res.body) {
  console.error("HTTP", res.status, await res.text());
  process.exit(3);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
const toolCalls = [];
const toolResults = [];
const activities = [];
let completed = null;
let answer = "";

function consume(frame) {
  const dataLines = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return;
  let event;
  try {
    event = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }
  if (event.type === "tool_call") toolCalls.push(event);
  if (event.type === "tool_result") toolResults.push(event);
  if (event.type === "activity") activities.push(event);
  if (event.type === "answer_delta") answer += event.text || "";
  if (event.type === "completed") completed = event;
  if (event.type === "error") console.error("stream error", event);
}

while (true) {
  const {done, value} = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, {stream: true}).replace(/\r\n/g, "\n");
  let sep;
  while ((sep = buffer.indexOf("\n\n")) >= 0) {
    const frame = buffer.slice(0, sep);
    buffer = buffer.slice(sep + 2);
    consume(frame);
  }
}
if (buffer.trim()) consume(buffer);

console.log("ms", Date.now() - t0);
console.log("toolCalls", toolCalls.map(t => t.name));
console.log("toolResults", toolResults.map(t => ({name: t.name, ok: t.ok, detail: t.detail})));
console.log("rounds", completed?.rounds, "toolCalls", completed?.toolCalls, "modelRequests", completed?.modelRequests);
console.log("status", completed?.status, "limit", completed?.limitReason);
console.log("citations", (completed?.citations || []).map(c => ({id: c.evidenceId, doc: c.documentId.slice(0, 8), q: c.quote.slice(0, 80)})));
console.log("answer", (completed?.answerText || answer).slice(0, 500));

const multiRound = (completed?.toolCalls ?? 0) >= 2 && (completed?.rounds ?? 0) >= 2;
const hasSearch = toolCalls.some(t => t.name === "search_documents");
const followUp =
  toolCalls.length >= 2 &&
  toolCalls.slice(1).some(t => t.name === "inspect_passage" || t.name === "search_documents" || t.name === "list_document_sections");
const citesOk = (completed?.citations || []).length >= 1;
const amounts =
  /100,000/.test(completed?.answerText || answer) && /1,000,000/.test(completed?.answerText || answer);
const notice = /30/.test(completed?.answerText || answer) && /60/.test(completed?.answerText || answer);

console.log({multiRound, hasSearch, followUp, citesOk, amounts, notice});
process.exitCode = multiRound && hasSearch && followUp && citesOk && amounts ? 0 : 4;
