/**
 * Phase 2 live retrieval against Supabase (synthetic fixture text).
 * Does not print secrets. Leaves no permanent rows when cleanup succeeds.
 *
 * Usage: node --env-file=.env.local scripts/phase2-live-retrieval.mjs
 */
import {createClient} from "@supabase/supabase-js";
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {createChunks} from "../src/lib/documents/chunks.ts";
import {createCanonicalSource} from "../src/lib/evidence/verify.ts";
import {retrieveFromSupabase, reindexDocumentChunks} from "../src/lib/retrieval/supabase.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error(JSON.stringify({ok: false, error: "Missing Supabase env"}));
  process.exit(1);
}

const db = createClient(url, service, {auth: {persistSession: false, autoRefreshToken: false}});
const text = readFileSync(resolve(root, "fixtures/phase2-contract-150.txt"), "utf8").replace(/\r\n/g, "\n");
const pageStarts = [];
const re = /\[PAGE (\d+)\]/g;
let match;
while ((match = re.exec(text))) pageStarts.push({pageIndex: Number(match[1]) - 1, start: match.index});
const pages = pageStarts.map((entry, i) => {
  const end = i + 1 < pageStarts.length ? pageStarts[i + 1].start : text.length;
  return {pageIndex: entry.pageIndex, text: text.slice(entry.start, end)};
});
const source = createCanonicalSource(pages);
const chunks = createChunks(source.text);
const documentId = randomUUID();
const results = [];

function record(name, pass, detail = {}) {
  results.push({name, pass, ...detail});
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail.error ? ` — ${detail.error}` : ""}`);
}

try {
  const {error: insertDocError} = await db.from("documents").insert({
    id: documentId,
    name: "phase2-live-retrieval.txt.pdf",
    mime_type: "application/pdf",
    size_bytes: Math.max(1, Buffer.byteLength(source.text)),
    storage_path: `documents/${documentId}.pdf`,
    status: "ready",
    page_count: pages.length,
    unreadable_page_count: 0,
    char_count: source.text.length
  });
  if (insertDocError) throw insertDocError;

  const pageRows = pages.map(page => {
    const bounds = source.pages.find(p => p.pageIndex === page.pageIndex);
    return {
      document_id: documentId,
      page_index: page.pageIndex,
      content: page.text,
      start_offset: bounds.start,
      end_offset: bounds.end
    };
  });
  for (let i = 0; i < pageRows.length; i += 100) {
    const {error} = await db.from("document_pages").insert(pageRows.slice(i, i + 100));
    if (error) throw error;
  }
  const chunkRows = chunks.map(chunk => ({
    document_id: documentId,
    chunk_index: chunk.chunkIndex,
    start_offset: chunk.startOffset,
    end_offset: chunk.endOffset,
    content: chunk.content
  }));
  const tIndex0 = Date.now();
  for (let i = 0; i < chunkRows.length; i += 100) {
    const {error} = await db.from("document_chunks").insert(chunkRows.slice(i, i + 100));
    if (error) throw error;
  }
  const indexMs = Date.now() - tIndex0;
  record("index synthetic 150-page contract", true, {
    pages: pages.length,
    chars: source.text.length,
    chunks: chunks.length,
    indexMs
  });

  const tRe = Date.now();
  const reindexed = await reindexDocumentChunks(documentId);
  record("reindexDocumentChunks", reindexed.chunkCount === chunks.length || reindexed.chunkCount > 0, {
    chunkCount: reindexed.chunkCount,
    ms: Date.now() - tRe
  });

  const queries = [
    {q: "Confidential Information disclose personnel", expect: /Confidential Information/i, where: "early"},
    {q: "AED 100,000", expect: /AED 100,000/, where: "liability"},
    {q: "AED 1,000,000", expect: /AED 1,000,000/, where: "fees"},
    {q: "30 days written notice", expect: /30 days written notice/i, where: "termination"},
    {q: "governed by the laws of England and Wales", expect: /England and Wales/i, where: "late"},
    {q: "Contracts (Rights of Third Parties) Act 1999", expect: /Third Parties/i, where: "page150"},
    {q: "quantum teleportation escrow covenant", expect: null, where: "absent"}
  ];

  for (const item of queries) {
    const t0 = Date.now();
    const result = await retrieveFromSupabase({
      documentId,
      query: item.q,
      limit: 8,
      mode: item.expect ? "ranked" : "existence",
      expand: true
    });
    const ms = Date.now() - t0;
    if (!item.expect) {
      const ok = result.passages.length === 0 && ["NO_MATCH_ESTABLISHED", "SEARCH_LIMITED", "PARTIAL_SOURCE"].includes(result.coverage.status);
      record(`retrieve absent (${item.where})`, ok, {ms, status: result.coverage.status, notes: result.coverage.notes.slice(0, 2)});
      continue;
    }
    const ok = result.passages.some(p => item.expect.test(p.content)) &&
      result.passages.every(p => p.documentId === documentId) &&
      result.passages.every(p => source.text.slice(p.startOffset, p.endOffset) === p.content || p.content.length > 0);
    const offsetOk = result.passages.every(p => source.text.slice(p.startOffset, p.endOffset) === p.content);
    record(`retrieve ${item.where}`, ok && offsetOk, {
      ms,
      status: result.coverage.status,
      hits: result.passages.length,
      offsetOk,
      top: result.passages[0]?.content.slice(0, 90).replace(/\s+/g, " ")
    });
  }

  const invalid = await retrieveFromSupabase({
    documentId: "00000000-0000-4000-8000-000000000000",
    query: "liability",
    limit: 5
  });
  record("invalid/missing document id", invalid.coverage.status === "DOCUMENT_UNAVAILABLE", {status: invalid.coverage.status});
} catch (error) {
  record("uncaught", false, {error: error instanceof Error ? error.message : String(error)});
} finally {
  await db.from("documents").delete().eq("id", documentId);
}

const failed = results.filter(r => !r.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  passed: results.filter(r => r.pass).length,
  failed: failed.length,
  documentChars: source.text.length,
  chunkCount: chunks.length,
  results
}, null, 2));
process.exit(failed.length ? 1 : 0);
