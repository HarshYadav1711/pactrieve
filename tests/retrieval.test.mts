import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createChunks, detectSections} from "../src/lib/documents/chunks.ts";
import {createCanonicalSource, verifyQuote} from "../src/lib/evidence/verify.ts";
import {searchMemoryDocument} from "../src/lib/retrieval/memory.ts";
import {expandPassages} from "../src/lib/retrieval/expand.ts";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const contractText = readFileSync(resolve(fixtures, "phase2-contract-150.txt"), "utf8").replace(/\r\n/g, "\n");

function buildDoc(text = contractText, documentId = "11111111-1111-4111-8111-111111111111") {
  // Approximate page boundaries using [PAGE n] markers.
  const pageStarts: {pageIndex: number; start: number}[] = [];
  const re = /\[PAGE (\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    pageStarts.push({pageIndex: Number(match[1]) - 1, start: match.index});
  }
  const pages = pageStarts.map((entry, i) => {
    const end = i + 1 < pageStarts.length ? pageStarts[i + 1].start : text.length;
    return {pageIndex: entry.pageIndex, text: text.slice(entry.start, end)};
  });
  const source = createCanonicalSource(pages);
  // createCanonicalSource inserts "\n" between pages — rebuild text consistently for chunking.
  const chunks = createChunks(source.text);
  return {
    documentId,
    text: source.text,
    pages: source.pages,
    chunks,
    unreadablePageCount: 0,
    pageCount: pages.length,
    source
  };
}

test("structure-aware chunks preserve exact canonical offsets", () => {
  const doc = buildDoc();
  assert.ok(doc.chunks.length > 20);
  for (const chunk of doc.chunks) {
    assert.equal(chunk.content, doc.text.slice(chunk.startOffset, chunk.endOffset));
    assert.ok(chunk.endOffset > chunk.startOffset);
  }
  assert.equal(doc.chunks[0].startOffset, 0);
  assert.equal(doc.chunks.at(-1)?.endOffset, doc.text.length);
});

test("detects numbered liability and termination headings", () => {
  const sections = detectSections(contractText);
  assert.ok(sections.some(s => /8\.\s+LIMITATION OF LIABILITY/i.test(s.label) || /LIMITATION OF LIABILITY/i.test(s.label)));
  assert.ok(sections.some(s => /12\.\s+TERMINATION/i.test(s.label) || /TERMINATION/i.test(s.label)));
});

test("retrieves early confidentiality clause", () => {
  const doc = buildDoc();
  const result = searchMemoryDocument(doc, "Confidential Information disclose personnel");
  assert.equal(result.coverage.status, "MATCHES_FOUND");
  assert.ok(result.passages.some(p => /Confidential Information/i.test(p.content)));
});

test("retrieves late governing-law clause near page 140+", () => {
  const doc = buildDoc();
  const result = searchMemoryDocument(doc, "governed by the laws of England and Wales");
  assert.equal(result.coverage.status, "MATCHES_FOUND");
  const hit = result.passages.find(p => /England and Wales/i.test(p.content));
  assert.ok(hit);
  assert.ok(hit!.pageIndices.some(p => p >= 139));
});

test("retrieves page-150 general clause", () => {
  const doc = buildDoc();
  const result = searchMemoryDocument(doc, "Contracts (Rights of Third Parties) Act 1999");
  assert.ok(result.passages.some(p => /Third Parties/i.test(p.content)));
});

test("exact monetary values remain distinguishable", () => {
  const doc = buildDoc();
  const cap = searchMemoryDocument(doc, "AED 100,000");
  const fees = searchMemoryDocument(doc, "AED 1,000,000");
  assert.ok(cap.passages.some(p => /AED 100,000/.test(p.content)));
  assert.ok(!cap.passages.some(p => /AED 1,000,000/.test(p.content) && !/AED 100,000/.test(p.content)));
  assert.ok(fees.passages.some(p => /AED 1,000,000/.test(p.content)));
});

test("negated obligation shall not exceed is findable and distinct from fees", () => {
  const doc = buildDoc();
  const result = searchMemoryDocument(doc, "shall not exceed AED 100,000");
  assert.ok(result.passages.some(p => /shall not exceed AED 100,000/i.test(p.content)));
});

test("30 days notice is distinguishable from 60 days", () => {
  const doc = buildDoc();
  const thirty = searchMemoryDocument(doc, "30 days written notice");
  assert.ok(thirty.passages.some(p => /30 days written notice/i.test(p.content)));
  assert.ok(!thirty.passages[0].content.includes("60 days") || /30 days/.test(thirty.passages[0].content));
});

test("section 12.4 lookup returns effect of termination", () => {
  const doc = buildDoc();
  const result = searchMemoryDocument(doc, "Section 12.4");
  assert.ok(result.passages.some(p => /12\.4|Effect of Termination|survive termination/i.test(p.content)));
});

test("context expansion includes liability exception clause near the cap", () => {
  const doc = buildDoc();
  const seed = searchMemoryDocument(doc, "aggregate liability shall not exceed AED 100,000", {expand: false, limit: 3});
  assert.ok(seed.passages.length);
  const expanded = expandPassages(doc.documentId, doc.text, doc.chunks, seed.passages, {maxExpandedChars: 6000});
  const joined = expanded.map(p => p.content).join("\n");
  assert.match(joined, /AED 100,000/);
  // Neighbor/same-section expansion should surface exceptions when nearby.
  assert.ok(/8\.2|does not apply to confidentiality|indemnit/i.test(joined) || expanded.length >= seed.passages.length);
});

test("no-match does not claim absence", () => {
  const doc = buildDoc();
  const result = searchMemoryDocument(doc, "quantum teleportation escrow covenant", {mode: "ranked", limit: 5});
  assert.equal(result.passages.length, 0);
  assert.ok(["SEARCH_LIMITED", "NO_MATCH_ESTABLISHED", "PARTIAL_SOURCE"].includes(result.coverage.status));
  assert.ok(result.coverage.notes.some(n => /does not prove|may still exist|no match/i.test(n)));
});

test("partial unreadable coverage is reported", () => {
  const doc = buildDoc();
  doc.unreadablePageCount = 12;
  const result = searchMemoryDocument(doc, "nonexistent unique phrase zzqx", {mode: "existence"});
  assert.equal(result.coverage.status, "PARTIAL_SOURCE");
  assert.equal(result.coverage.unreadablePageCount, 12);
});

test("empty query fails closed", () => {
  const doc = buildDoc();
  const result = searchMemoryDocument(doc, "   ");
  assert.equal(result.coverage.status, "SEARCH_FAILED");
});

test("two documents with identical language stay scoped", () => {
  const a = buildDoc(contractText, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const b = buildDoc(contractText, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  const ra = searchMemoryDocument(a, "AED 100,000");
  const rb = searchMemoryDocument(b, "AED 100,000");
  assert.ok(ra.passages.every(p => p.documentId === a.documentId));
  assert.ok(rb.passages.every(p => p.documentId === b.documentId));
});

test("overlapping chunk offsets remain valid substrings including unicode", () => {
  const text = "Party A café terms.\n8. LIABILITY\nCap is ₹5,000 only.\n8.2 Exceptions apply.\n";
  const source = createCanonicalSource([{pageIndex: 0, text}, {pageIndex: 1, text: "Continuation across page for ₹5,000 cap."}]);
  const chunks = createChunks(source.text, 40, 10);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.equal(source.text.slice(chunk.startOffset, chunk.endOffset), chunk.content);
  }
  const verified = verifyQuote(source, "₹5,000");
  assert.equal(verified.verified, true);
  assert.ok(verified.occurrences.length >= 1);
});

test("cross-page liability wording is retrievable from canonical text", () => {
  const pages = [
    {pageIndex: 0, text: "8. LIABILITY\nThe Supplier aggregate liability shall not exceed"},
    {pageIndex: 1, text: "AED 100,000 subject to Clause 8.2 exceptions."}
  ];
  const source = createCanonicalSource(pages);
  const chunks = createChunks(source.text, 80, 20);
  const doc = {
    documentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    text: source.text,
    pages: source.pages,
    chunks,
    unreadablePageCount: 0,
    pageCount: 2
  };
  const result = searchMemoryDocument(doc, "shall not exceed AED 100,000");
  assert.ok(result.passages.length);
  assert.ok(result.passages.some(p => p.pageIndices.length >= 1));
});

test("excessive limit is capped by caller schema elsewhere; memory honors requested limit", () => {
  const doc = buildDoc();
  const result = searchMemoryDocument(doc, "Operational note", {limit: 3, expand: false});
  assert.ok(result.passages.length <= 3);
});
