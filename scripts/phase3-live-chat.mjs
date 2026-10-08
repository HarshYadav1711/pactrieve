/**
 * Live Phase 3 chat smoke against Supabase + configured LLM.
 * Requires: SUPABASE_*, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
 * Usage: node --env-file=.env.local --experimental-strip-types scripts/phase3-live-chat.mjs
 *
 * Does not print secrets. Marks BLOCKED when LLM env is missing.
 */
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createCanonicalSource} from "../src/lib/evidence/verify.ts";
import {createChunks} from "../src/lib/documents/chunks.ts";
import {searchMemoryDocument} from "../src/lib/retrieval/memory.ts";
import {runGroundedChat} from "../src/lib/chat/pipeline.ts";
import {createOpenAiCompatibleProvider, loadLlmConfig} from "../src/lib/llm/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const llm = loadLlmConfig(process.env);
if (!llm.ok) {
  console.log("BLOCKED: live LLM chat —", llm.message);
  console.log("missing:", llm.missing.join(", "));
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log("BLOCKED: Supabase credentials missing for live document load fallback.");
  // Still exercise provider with in-memory fixture.
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
  },
  maxTokens: llm.config.maxTokens
});

const totalMs = Date.now() - t0;
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
  deltaCount,
  retrievalToFirstDeltaMs: firstDeltaAt === null ? null : firstDeltaAt - t0,
  totalMs,
  eventTypes: events,
  answerPreview: result.answerText.slice(0, 240),
  citationPreview: result.citations[0]?.quote?.slice(0, 160) ?? null
});

if (deltaCount < 2) {
  console.error("FAIL: expected multiple streamed answer deltas from live provider");
  process.exit(1);
}
if (result.status === "failed") {
  console.error("FAIL: chat pipeline failed");
  process.exit(1);
}
console.log("PASS: live provider streamed multiple deltas");

// Insufficient-evidence probe (no LLM needed if retrieval empty — still validates path).
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
  emit: () => {}
});
console.log("insufficient_evidence probe:", insuff.status, insuff.answerText.slice(0, 120));
if (insuff.status !== "insufficient_evidence") {
  console.error("FAIL: expected insufficient_evidence");
  process.exit(1);
}
console.log("PASS: insufficient-evidence path");
