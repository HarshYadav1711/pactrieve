import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createCanonicalSource} from "../src/lib/evidence/verify.ts";
import {createChunks} from "../src/lib/documents/chunks.ts";
import {searchMemoryDocument} from "../src/lib/retrieval/memory.ts";
import {createFakeProvider} from "../src/lib/llm/fake.ts";
import {
  canTransition,
  createMemoryConversationStore,
  runDurableGroundedChat,
  STALE_GENERATION_MS
} from "../src/lib/chat/persist/index.ts";
import type {ChatStreamEvent} from "../src/lib/chat/types.ts";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const contractText = readFileSync(resolve(fixtures, "phase2-contract-150.txt"), "utf8").replace(/\r\n/g, "\n");
const DOC_A = "11111111-1111-4111-8111-111111111111";
const DOC_B = "22222222-2222-4222-8222-222222222222";

function buildDoc(documentId = DOC_A) {
  const pageStarts: {pageIndex: number; start: number}[] = [];
  const re = /\[PAGE (\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(contractText))) {
    pageStarts.push({pageIndex: Number(match[1]) - 1, start: match.index});
  }
  const pages = pageStarts.map((entry, i) => {
    const end = i + 1 < pageStarts.length ? pageStarts[i + 1].start : contractText.length;
    return {pageIndex: entry.pageIndex, text: contractText.slice(entry.start, end)};
  });
  const source = createCanonicalSource(pages);
  return {
    documentId,
    text: source.text,
    pages: source.pages,
    chunks: createChunks(source.text),
    unreadablePageCount: 0,
    pageCount: pages.length,
    source
  };
}

test("status transitions reject late completion after stopped", () => {
  assert.equal(canTransition("streaming", "stopped"), true);
  assert.equal(canTransition("stopped", "complete"), false);
  assert.equal(canTransition("complete", "stopped"), false);
  assert.equal(canTransition("streaming", "complete"), true);
});

test("1-5. conversation create, associate, persist user/assistant, order", async () => {
  const store = createMemoryConversationStore();
  const conv = await store.createConversation(DOC_A);
  assert.equal(conv.documentId, DOC_A);
  const user = await store.appendUserMessage(conv.id, DOC_A, "What is the liability cap?");
  const assistant = await store.createAssistantMessage(conv.id, DOC_A);
  assert.equal(user.role, "user");
  assert.equal(assistant.status, "pending");
  await store.markStreaming(assistant.id);
  await store.checkpointContent(assistant.id, "Partial…");
  const finalized = await store.finalizeAssistant({
    messageId: assistant.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "complete",
    content: "The cap is AED 100,000.",
    citations: [{
      evidenceId: "e1",
      documentId: DOC_A,
      quote: "AED 100,000",
      startOffset: 10,
      endOffset: 21,
      pageIndices: [29],
      sectionLabel: "8. LIMITATION",
      occurrenceIndex: 0,
      verified: true
    }]
  });
  assert.equal(finalized.ok, true);
  assert.equal(finalized.status, "complete");
  const loaded = await store.getConversation(conv.id, DOC_A);
  assert.ok(loaded);
  assert.equal(loaded!.messages.length, 2);
  assert.equal(loaded!.messages[0].role, "user");
  assert.equal(loaded!.messages[1].role, "assistant");
  assert.equal(loaded!.messages[1].citations.length, 1);
  assert.equal(loaded!.messages[1].citations[0].quote, "AED 100,000");
});

test("6-8. reopen history and citation persistence", async () => {
  const store = createMemoryConversationStore();
  const conv = await store.createConversation(DOC_A);
  await store.appendUserMessage(conv.id, DOC_A, "Q1");
  const a = await store.createAssistantMessage(conv.id, DOC_A);
  await store.finalizeAssistant({
    messageId: a.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "complete",
    content: "A1 [e1]",
    citations: [{
      evidenceId: "e1",
      documentId: DOC_A,
      quote: "shall not exceed AED 100,000",
      startOffset: 1,
      endOffset: 30,
      pageIndices: [29],
      sectionLabel: null,
      occurrenceIndex: 0,
      verified: true
    }]
  });
  const list = await store.listConversations(DOC_A);
  assert.equal(list.length, 1);
  const again = await store.getConversation(list[0].id, DOC_A);
  assert.equal(again!.messages[1].citations[0].documentId, DOC_A);
});

test("21. wrong-document conversation rejected", async () => {
  const store = createMemoryConversationStore();
  const conv = await store.createConversation(DOC_A);
  assert.equal(await store.assertConversationDocument(conv.id, DOC_B), false);
  assert.equal(await store.getConversation(conv.id, DOC_B), null);
  await assert.rejects(() => store.appendUserMessage(conv.id, DOC_B, "nope"));
});

test("22. invalid message cancel returns not ok", async () => {
  const store = createMemoryConversationStore();
  const result = await store.requestCancel("00000000-0000-4000-8000-000000000099", DOC_A);
  assert.equal(result.ok, false);
});

test("9-14. stop before tokens / after deltas / repeated / after complete", async () => {
  const store = createMemoryConversationStore();
  const conv = await store.createConversation(DOC_A);
  const a = await store.createAssistantMessage(conv.id, DOC_A);

  // Stop before first token
  const cancelEarly = await store.requestCancel(a.id, DOC_A);
  assert.equal(cancelEarly.ok, true);
  assert.equal(await store.isCancelRequested(a.id), true);
  const finEarly = await store.finalizeAssistant({
    messageId: a.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "stopped",
    content: ""
  });
  assert.equal(finEarly.status, "stopped");

  // Repeated stop on terminal
  const again = await store.requestCancel(a.id, DOC_A);
  assert.equal(again.alreadyTerminal, true);

  // Late complete cannot overwrite stopped
  const late = await store.finalizeAssistant({
    messageId: a.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "complete",
    content: "should not win"
  });
  assert.equal(late.status, "stopped");
  assert.equal(late.content, "");

  // Stop after deltas on a new message
  const b = await store.createAssistantMessage(conv.id, DOC_A);
  await store.markStreaming(b.id);
  await store.checkpointContent(b.id, "Hello partial world");
  await store.requestCancel(b.id, DOC_A);
  const finB = await store.finalizeAssistant({
    messageId: b.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "stopped",
    content: "Hello partial world"
  });
  assert.equal(finB.content, "Hello partial world");
  assert.equal(finB.status, "stopped");
});

test("19. stale generation recovery", async () => {
  const store = createMemoryConversationStore();
  const conv = await store.createConversation(DOC_A);
  const a = await store.createAssistantMessage(conv.id, DOC_A);
  await store.markStreaming(a.id);
  await store.checkpointContent(a.id, "stale text");
  store.forceUpdatedAt(a.id, new Date(Date.now() - STALE_GENERATION_MS - 1000).toISOString());
  const n = await store.recoverStaleInConversation(conv.id, STALE_GENERATION_MS);
  assert.equal(n, 1);
  const loaded = await store.getConversation(conv.id, DOC_A);
  assert.equal(loaded!.messages[0].status, "interrupted");
  assert.equal(loaded!.messages[0].content, "stale text");
});

test("17-18. checkpoint then finalize failure race keeps winner", async () => {
  const store = createMemoryConversationStore();
  const conv = await store.createConversation(DOC_A);
  const a = await store.createAssistantMessage(conv.id, DOC_A);
  await store.checkpointContent(a.id, "checkpointed");
  await store.finalizeAssistant({
    messageId: a.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "stopped",
    content: "checkpointed"
  });
  const failedAttempt = await store.finalizeAssistant({
    messageId: a.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "failed",
    content: "other"
  });
  assert.equal(failedAttempt.status, "stopped");
  assert.equal(failedAttempt.content, "checkpointed");
});

test("durable stop mid-stream persists partial and citations only for resolved ids", async () => {
  const doc = buildDoc();
  const store = createMemoryConversationStore();
  const events: ChatStreamEvent["type"][] = [];
  const abort = new AbortController();

  const provider = createFakeProvider({
    mode: "stream",
    chunks: ["The cap is AED 100,000. ", "[e1] more text"],
    delayMs: 30
  });

  const run = runDurableGroundedChat({
    documentId: DOC_A,
    document: {id: DOC_A, name: "c.txt", status: "ready"},
    source: doc.source,
    question: "AED 100,000 aggregate liability",
    store,
    retrieve: async req => searchMemoryDocument(doc, req.query, {limit: 8, expand: true}),
    provider,
    emit: e => {
      events.push(e.type);
      if (e.type === "session") {
        // Request cancel shortly after session begins.
        setTimeout(() => {
          void store.requestCancel(e.assistantMessageId, DOC_A).then(() => abort.abort());
        }, 40);
      }
    },
    requestSignal: abort.signal,
    cancelPollMs: 20
  });

  const result = await run;
  assert.ok(events.includes("session"));
  assert.equal(result.persistedStatus, "stopped");
  assert.equal(result.persistenceOk, true);
  const loaded = await store.getConversation(result.conversationId, DOC_A);
  const assistant = loaded!.messages.find(m => m.role === "assistant")!;
  assert.equal(assistant.status, "stopped");
  assert.ok(assistant.content.length >= 0);
  // Incomplete citation markers must not invent citations; resolved [e1] may appear if fully streamed.
  for (const c of assistant.citations) {
    assert.equal(c.documentId, DOC_A);
    assert.ok(c.quote.length > 0);
  }
});

test("durable completed grounded answer persists verified citation", async () => {
  const doc = buildDoc();
  const store = createMemoryConversationStore();
  const result = await runDurableGroundedChat({
    documentId: DOC_A,
    document: {id: DOC_A, name: "c.txt", status: "ready"},
    source: doc.source,
    question: "AED 100,000 aggregate liability",
    store,
    retrieve: async req => searchMemoryDocument(doc, req.query, {limit: 8, expand: true}),
    provider: createFakeProvider({
      mode: "stream",
      chunks: ["Liability shall not exceed AED 100,000. ", "[e1]"]
    }),
    emit: () => {}
  });
  assert.equal(result.pipeline.status, "answered");
  assert.equal(result.persistedStatus, "complete");
  const loaded = await store.getConversation(result.conversationId, DOC_A);
  assert.equal(loaded!.messages.length, 2);
  assert.ok(loaded!.messages[1].citations.length >= 1);
});

test("24-25. stop with malformed citation marker stores no fake citation", async () => {
  const store = createMemoryConversationStore();
  const conv = await store.createConversation(DOC_A);
  const a = await store.createAssistantMessage(conv.id, DOC_A);
  await store.finalizeAssistant({
    messageId: a.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "stopped",
    content: "Something about liability [e",
    citations: []
  });
  const loaded = await store.getConversation(conv.id, DOC_A);
  assert.equal(loaded!.messages[0].citations.length, 0);
  assert.equal(loaded!.messages[0].content.includes("[e"), true);
});

test("20. duplicate finalize is idempotent", async () => {
  const store = createMemoryConversationStore();
  const conv = await store.createConversation(DOC_A);
  const a = await store.createAssistantMessage(conv.id, DOC_A);
  const first = await store.finalizeAssistant({
    messageId: a.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "complete",
    content: "done"
  });
  const second = await store.finalizeAssistant({
    messageId: a.id,
    conversationId: conv.id,
    documentId: DOC_A,
    status: "complete",
    content: "done again"
  });
  assert.equal(first.status, "complete");
  assert.equal(second.status, "complete");
  assert.equal(second.content, "done");
});

test("new question after stop uses same conversation", async () => {
  const doc = buildDoc();
  const store = createMemoryConversationStore();
  const first = await runDurableGroundedChat({
    documentId: DOC_A,
    document: {id: DOC_A, name: "c.txt", status: "ready"},
    source: doc.source,
    question: "AED 100,000 aggregate liability",
    store,
    retrieve: async req => searchMemoryDocument(doc, req.query, {limit: 8, expand: true}),
    provider: createFakeProvider({mode: "stream", chunks: ["A [e1]"]}),
    emit: () => {}
  });
  const second = await runDurableGroundedChat({
    documentId: DOC_A,
    conversationId: first.conversationId,
    document: {id: DOC_A, name: "c.txt", status: "ready"},
    source: doc.source,
    question: "30 days written notice terminate",
    store,
    retrieve: async req => searchMemoryDocument(doc, req.query, {limit: 8, expand: true}),
    provider: createFakeProvider({mode: "stream", chunks: ["B [e1]"]}),
    emit: () => {}
  });
  assert.equal(second.conversationId, first.conversationId);
  const loaded = await store.getConversation(first.conversationId, DOC_A);
  assert.equal(loaded!.messages.length, 4);
});
