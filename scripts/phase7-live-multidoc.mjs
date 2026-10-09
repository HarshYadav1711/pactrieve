/**
 * Phase 7 live multi-document chat probe (requires Supabase + Groq env).
 * Usage: node --experimental-strip-types scripts/phase7-live-multidoc.mjs
 */
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");
try {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
} catch {
  console.error("Missing .env.local");
  process.exit(1);
}

const base = process.env.PHASE7_BASE_URL || "http://localhost:3000";

async function listDocs() {
  const res = await fetch(`${base}/api/documents`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "list failed");
  return (body.documents || []).filter(d => d.status === "ready");
}

async function streamChat(documentIds, question) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/research/chat`, {
    method: "POST",
    headers: {"Content-Type": "application/json", Accept: "text/event-stream"},
    body: JSON.stringify({documentIds, question})
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`chat ${res.status}: ${body}`);
  }
  const text = await res.text();
  const events = [];
  for (const block of text.split("\n\n")) {
    const line = block.split("\n").find(l => l.startsWith("data: "));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      /* ignore */
    }
  }
  const completed = events.find(e => e.type === "completed");
  return {ms: Date.now() - t0, events, completed};
}

const docs = await listDocs();
console.log("ready docs:", docs.map(d => `${d.name} (${d.id.slice(0, 8)})`).join(", ") || "(none)");
if (docs.length < 2) {
  console.error("Need at least 2 ready documents uploaded.");
  process.exit(2);
}

const preferred = docs.filter(d => /phase7-(alpha|beta)/i.test(d.name));
const pair = (preferred.length >= 2 ? preferred : docs).slice(0, 2).map(d => d.id);
const question =
  "Which agreement requires longer termination notice, and how do the liability caps differ?";
console.log("asking across", pair);
const {ms, completed, events} = await streamChat(pair, question);
console.log("duration_ms", ms);
console.log("event_types", events.map(e => e.type).join(","));
if (!completed) {
  console.error("No completed event");
  process.exit(3);
}
console.log("status", completed.status);
console.log("coverage", completed.coverageStatus);
console.log("citations", (completed.citations || []).map(c => ({
  id: c.evidenceId,
  doc: c.documentId.slice(0, 8),
  quote: c.quote.slice(0, 80)
})));
console.log("answer_preview", String(completed.answerText || "").slice(0, 500));
process.exit(completed.status === "answered" || completed.status === "insufficient_evidence" ? 0 : 4);
