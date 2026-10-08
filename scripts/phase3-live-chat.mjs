/**
 * Live Phase 3 chat smoke against configured LLM (+ optional Supabase).
 * Requires: LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
 * Usage: node --experimental-strip-types scripts/phase3-live-chat.mjs
 *    or: npm run test:phase3-live
 *
 * Loads `.env.local` from the repo root via Node's built-in `process.loadEnvFile`
 * when present. Existing process env vars are not overwritten (CI/deploy safe).
 * Does not print secrets.
 *
 * Assertions are split:
 *   A) Streaming correctness
 *   B) Grounded-answer correctness (known-answer question must yield verified citations)
 *   C) Insufficient-evidence probe (separate)
 */
import {existsSync, readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createCanonicalSource, verifyQuote} from "../src/lib/evidence/verify.ts";
import {createChunks} from "../src/lib/documents/chunks.ts";
import {searchMemoryDocument} from "../src/lib/retrieval/memory.ts";
import {runGroundedChat} from "../src/lib/chat/pipeline.ts";
import {createOpenAiCompatibleProvider, loadLlmConfig} from "../src/lib/llm/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envLocalPath = resolve(root, ".env.local");
if (existsSync(envLocalPath)) {
  process.loadEnvFile(envLocalPath);
}

const llm = loadLlmConfig(process.env);
if (!llm.ok) {
  console.log("BLOCKED: live LLM chat —", llm.message);
  console.log("missing:", llm.missing.join(", "));
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("NOTE: Supabase credentials missing — using in-memory fixture only.");
}

const fixture = readFileSync(resolve(root, "fixtures/phase2-contract-150.txt"), "utf8").replace(/\r\n/g, "\n");
const pageStarts = [];
const re = /\[PAGE (\d+)\]/g;
let match;
while ((match = re.exec(fixture))) pageStarts.push({pageIndex: Number(match[1]) - 1, start: match.index});
const pages = pageStarts.map((entry, i) => ({
  pageIndex: entry.pageIndex,
  text: fixture.slice(entry.start, i + 1 < pageStarts.length ? pageStarts[i + 1].start : fixture.length)
}));
const source = createCanonicalSource(pages);
const docId = "33333333-3333-4333-8333-333333333333";
const memory = {
  documentId: docId,
  text: source.text,
  pages: source.pages,
  chunks: createChunks(source.text),
  unreadablePageCount: 0,
  pageCount: pages.length
};

const provider = createOpenAiCompatibleProvider(llm.config);
const question = "AED 100,000 aggregate liability";
const events = [];
const t0 = Date.now();
let firstDeltaAt = null;
let deltaCount = 0;
let streamError = null;

const result = await runGroundedChat({
  documentId: docId,
  question,
  document: {id: docId, name: "phase2-contract-150.txt", status: "ready"},
  source,
  retrieve: async req => searchMemoryDocument(memory, req.query, {limit: 8, expand: true}),
  provider,
  emit: event => {
    events.push(event.type);
    if (event.type === "answer_delta") {
      deltaCount += 1;
      if (firstDeltaAt === null) firstDeltaAt = Date.now();
    }
    if (event.type === "error") streamError = event.code;
  },
  maxTokens: llm.config.maxTokens
});

const totalMs = Date.now() - t0;
const orderOk =
  events.includes("retrieval_started") &&
  events.includes("evidence_prepared") &&
  events.includes("generation_started") &&
  events.indexOf("retrieval_started") < events.indexOf("evidence_prepared") &&
  events.indexOf("evidence_prepared") < events.indexOf("generation_started") &&
  events.indexOf("generation_started") < events.indexOf("answer_delta") &&
  events.includes("completed");

console.log("LIVE Phase 3 chat result");
console.log({
  model: llm.config.model,
  baseUrlHost: new URL(llm.config.baseUrl).host,
  status: result.status,
  citationCount: result.citations.length,
  rejectedEvidenceIds: result.rejectedEvidenceIds,
  evidenceCount: result.evidenceCount,
  promptChars: result.promptChars,
  truncated: result.truncated,
  replacedProvisional: result.replacedProvisional,
  reasonCode: result.reasonCode ?? null,
  deltaCount,
  retrievalToFirstDeltaMs: firstDeltaAt === null ? null : firstDeltaAt - t0,
  totalMs,
  eventTypes: events,
  answerPreview: result.answerText.slice(0, 240),
  citationPreview: result.citations[0]?.quote?.slice(0, 160) ?? null
});

// --- A) Streaming correctness ---
let failed = false;
if (deltaCount < 2) {
  console.error("FAIL[A]: expected multiple streamed answer deltas");
  failed = true;
}
if (!orderOk) {
  console.error("FAIL[A]: unexpected event ordering", events);
  failed = true;
}
if (streamError) {
  console.error("FAIL[A]: stream error", streamError);
  failed = true;
}
if (result.status === "failed") {
  console.error("FAIL[A]: chat pipeline failed");
  failed = true;
}
if (!failed) console.log("PASS[A]: streaming correctness");

// --- B) Grounded-answer correctness ---
if (result.status !== "answered") {
  console.error("FAIL[B]: known-answer question did not complete as answered; status=", result.status);
  failed = true;
}
if (result.citations.length < 1) {
  console.error("FAIL[B]: expected at least one verified citation");
  failed = true;
}
if (/withdrawn|could not be linked to verified/i.test(result.answerText)) {
  console.error("FAIL[B]: answer fell back to unsupported-evidence message");
  failed = true;
}
for (const citation of result.citations) {
  if (citation.documentId !== docId) {
    console.error("FAIL[B]: citation document mismatch", citation.evidenceId);
    failed = true;
  }
  const check = verifyQuote(source, citation.quote);
  if (!check.verified) {
    console.error("FAIL[B]: citation quote not in source", citation.evidenceId);
    failed = true;
  }
  if (!/AED\s*100,000/i.test(citation.quote) && !/liability/i.test(citation.quote)) {
    console.error("FAIL[B]: citation does not look like liability evidence", citation.evidenceId);
    failed = true;
  }
}
if (!failed) console.log("PASS[B]: grounded-answer correctness");

// --- C) Insufficient-evidence probe (separate; no reliance on grounded path) ---
const insuffEvents = [];
const insuff = await runGroundedChat({
  documentId: docId,
  question: "purple elephant Martian indemnity",
  document: {id: docId, name: "phase2-contract-150.txt", status: "ready"},
  source,
  retrieve: async () => ({
    documentId: docId,
    query: "purple elephant Martian indemnity",
    passages: [],
    coverage: {
      status: "NO_MATCH_ESTABLISHED",
      searchablePageCount: 150,
      unreadablePageCount: 0,
      searchedChunkCount: 10,
      totalChunkCount: memory.chunks.length,
      mode: "existence",
      notes: ["no match"]
    }
  }),
  provider,
  emit: e => insuffEvents.push(e.type)
});
console.log("insufficient_evidence probe:", insuff.status, insuff.answerText.slice(0, 120));
if (insuff.status !== "insufficient_evidence") {
  console.error("FAIL[C]: expected insufficient_evidence");
  failed = true;
}
if (insuff.citations.length !== 0) {
  console.error("FAIL[C]: expected zero citations on abstention");
  failed = true;
}
if (!failed) console.log("PASS[C]: insufficient-evidence path");

if (failed) process.exit(1);
console.log("PASS: all live Phase 3 checks");
