/**
 * Phase 4 live smoke: durable chat + stop (fake-provider boundaries) + optional Groq.
 * Usage: node --experimental-strip-types scripts/phase4-live-chat.mjs
 *
 * Loads `.env.local` via process.loadEnvFile when present.
 * Does not print secrets.
 *
 * A) Memory-store stop + reopen (always)
 * B) Supabase persistence (requires SUPABASE_* + Phase 4 migration)
 * C) Optional Groq stream smoke (requires LLM_*)
 */
import {existsSync, readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createCanonicalSource} from "../src/lib/evidence/verify.ts";
import {createChunks} from "../src/lib/documents/chunks.ts";
import {searchMemoryDocument} from "../src/lib/retrieval/memory.ts";
import {createFakeProvider, createOpenAiCompatibleProvider, loadLlmConfig} from "../src/lib/llm/index.ts";
import {
  createMemoryConversationStore,
  createSupabaseConversationStore,
  runDurableGroundedChat
} from "../src/lib/chat/persist/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envLocalPath = resolve(root, ".env.local");
if (existsSync(envLocalPath)) process.loadEnvFile(envLocalPath);

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
const DOC = "33333333-3333-4333-8333-333333333333";
const memoryDoc = {
  documentId: DOC,
  text: source.text,
  pages: source.pages,
  chunks: createChunks(source.text),
  unreadablePageCount: 0,
  pageCount: pages.length
};

let failed = false;

// --- A) Fake-provider stop + reopen ---
{
  const store = createMemoryConversationStore();
  const abort = new AbortController();
  let assistantMessageId = "";
  const result = await runDurableGroundedChat({
    documentId: DOC,
    document: {id: DOC, name: "phase2-contract-150.txt", status: "ready"},
    source,
    question: "AED 100,000 aggregate liability",
    store,
    retrieve: async req => searchMemoryDocument(memoryDoc, req.query, {limit: 8, expand: true}),
    provider: createFakeProvider({
      mode: "stream",
      chunks: ["Partial liability answer ", "continues ", "with more tokens ", "[e1]"],
      delayMs: 40
    }),
    emit: e => {
      if (e.type === "session") assistantMessageId = e.assistantMessageId;
      if (e.type === "answer_delta" && e.text.includes("Partial") && assistantMessageId) {
        // Stop after the first visible token batch so partial text is non-empty.
        setTimeout(() => {
          void store.requestCancel(assistantMessageId, DOC).then(() => abort.abort());
        }, 20);
      }
    },
    requestSignal: abort.signal,
    cancelPollMs: 15
  });
  const loaded = await store.getConversation(result.conversationId, DOC);
  const assistant = loaded?.messages.find(m => m.role === "assistant");
  console.log("A) fake stop", {
    persistedStatus: result.persistedStatus,
    persistenceOk: result.persistenceOk,
    contentLen: assistant?.content.length ?? 0,
    status: assistant?.status,
    preview: assistant?.content.slice(0, 80) ?? ""
  });
  if (result.persistedStatus !== "stopped" || assistant?.status !== "stopped") {
    console.error("FAIL[A]: expected stopped persistence");
    failed = true;
  } else if (!assistant.content.trim()) {
    console.error("FAIL[A]: expected non-empty partial content after stop");
    failed = true;
  } else {
    console.log("PASS[A]: stop + reopen partial");
  }
}

// --- B) Supabase persistence ---
const hasSb = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
if (!hasSb) {
  console.log("BLOCKED[B]: Supabase credentials missing");
} else {
  try {
    const {createClient} = await import("@supabase/supabase-js");
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {persistSession: false, autoRefreshToken: false}
    });
    // Prefer an existing ready document; otherwise skip live DB doc create.
    const {data: docs, error: docError} = await db
      .from("documents")
      .select("id,name,status")
      .eq("status", "ready")
      .order("created_at", {ascending: false})
      .limit(1);
    if (docError) throw docError;
    if (!docs?.length) {
      console.log("BLOCKED[B]: no ready document in Supabase to attach conversation");
    } else {
      const documentId = docs[0].id;
      const store = createSupabaseConversationStore();
      const conv = await store.createConversation(documentId);
      const user = await store.appendUserMessage(conv.id, documentId, "Phase4 persistence probe");
      const assistant = await store.createAssistantMessage(conv.id, documentId);
      await store.checkpointContent(assistant.id, "Saved partial probe text");
      await store.requestCancel(assistant.id, documentId);
      const fin = await store.finalizeAssistant({
        messageId: assistant.id,
        conversationId: conv.id,
        documentId,
        status: "stopped",
        content: "Saved partial probe text"
      });
      const loaded = await store.getConversation(conv.id, documentId);
      console.log("B) supabase", {
        documentId,
        conversationId: conv.id,
        userId: user.id,
        status: fin.status,
        reloaded: loaded?.messages.map(m => m.status)
      });
      if (fin.status !== "stopped" || loaded?.messages.at(-1)?.content !== "Saved partial probe text") {
        console.error("FAIL[B]: supabase stop persistence");
        failed = true;
      } else {
        console.log("PASS[B]: supabase conversation persistence");
      }
    }
  } catch (error) {
    const err = error && typeof error === "object" ? error : {message: String(error)};
    const message =
      error instanceof Error
        ? error.message
        : "message" in err
          ? String(err.message)
          : JSON.stringify(error);
    const code = "code" in err ? String(err.code) : "";
    const details = "details" in err ? String(err.details ?? "") : "";
    const hint = "hint" in err ? String(err.hint ?? "") : "";
    const blob = `${message} ${code} ${details} ${hint}`;
    const needsMigration = /cancel_requested|messages_status_check|generation_seq|42703|PGRST204/i.test(blob);
    if (needsMigration) {
      console.log("BLOCKED[B]: apply db/migrations/20261008_phase4_chat_persistence.sql —", message, code || "");
    } else {
      console.error("FAIL[B]:", message, code || "", details || "", hint || "");
      failed = true;
    }
  }
}

// --- C) Optional Groq smoke (complete path; stop is covered by A) ---
const llm = loadLlmConfig(process.env);
if (!llm.ok) {
  console.log("BLOCKED[C]: LLM not configured —", llm.missing.join(", "));
} else {
  const store = createMemoryConversationStore();
  const result = await runDurableGroundedChat({
    documentId: DOC,
    document: {id: DOC, name: "phase2-contract-150.txt", status: "ready"},
    source,
    question: "AED 100,000 aggregate liability",
    store,
    retrieve: async req => searchMemoryDocument(memoryDoc, req.query, {limit: 8, expand: true}),
    provider: createOpenAiCompatibleProvider(llm.config),
    emit: () => {},
    maxTokens: llm.config.maxTokens
  });
  console.log("C) groq durable", {
    model: llm.config.model,
    host: new URL(llm.config.baseUrl).host,
    status: result.pipeline.status,
    persistedStatus: result.persistedStatus,
    citations: result.pipeline.citations.length
  });
  if (result.persistedStatus !== "complete" || result.pipeline.status !== "answered" || result.pipeline.citations.length < 1) {
    console.error("FAIL[C]: groq durable grounded answer");
    failed = true;
  } else {
    console.log("PASS[C]: groq durable grounded answer");
  }
}

if (failed) process.exit(1);
console.log("PASS: Phase 4 live checks completed");
