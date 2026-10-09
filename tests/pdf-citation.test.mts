import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {createCanonicalSource, verifyQuote} from "../src/lib/evidence/verify.ts";
import {extractDocument} from "../src/lib/documents/extract.ts";
import {reconstructPdfPage} from "../src/lib/documents/pdf-text.ts";
import {
  alignPageLocalRange,
  locateCitationOnPdf,
  pageIndicesForRange,
  reconstructPageWithMap,
  splitCanonicalRange
} from "../src/lib/pdf/index.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("1. single-line citation maps to item spans", () => {
  const items = [
    {str: "Liability ", width: 40, transform: [1, 0, 0, 12, 0, 100]},
    {str: "cap is AED 100,000.", width: 90, transform: [1, 0, 0, 12, 40, 100]}
  ];
  const map = reconstructPageWithMap(items);
  assert.equal(map.text, reconstructPdfPage(items));
  const aligned = alignPageLocalRange(map, map.text, map.text.indexOf("AED"), map.text.indexOf("AED") + "AED 100,000".length);
  assert.equal(aligned.ok, true);
  if (!aligned.ok) return;
  assert.ok(aligned.itemSpans.length >= 1);
  assert.ok(aligned.quote.includes("AED"));
});

test("2. multiline citation across reconstructed lines", () => {
  const items = [
    {str: "This Agreement shall remain", width: 120, transform: [1, 0, 0, 12, 0, 200]},
    {str: "in full force and effect.", width: 110, transform: [1, 0, 0, 12, 0, 180]}
  ];
  const map = reconstructPageWithMap(items);
  assert.match(map.text, /Agreement[\s\S]+force/);
  const start = map.text.indexOf("This Agreement");
  const end = map.text.indexOf("effect.") + "effect.".length;
  const aligned = alignPageLocalRange(map, map.text, start, end);
  assert.equal(aligned.ok, true);
  if (!aligned.ok) return;
  assert.ok(aligned.itemSpans.length >= 2, "expected spans on multiple text items");
});

test("3. citation split across text items", () => {
  const items = [
    {str: "pay", width: 20, transform: [1, 0, 0, 10, 0, 50]},
    {str: "ment", width: 24, transform: [1, 0, 0, 10, 20, 50]},
    {str: " due", width: 22, transform: [1, 0, 0, 10, 44, 50]}
  ];
  const map = reconstructPageWithMap(items);
  const start = map.text.indexOf("payment");
  const aligned = alignPageLocalRange(map, map.text, start, start + "payment".length);
  assert.equal(aligned.ok, true);
  if (!aligned.ok) return;
  assert.ok(aligned.itemSpans.length >= 2);
});

test("3b. item indices preserve original textContent positions when non-string items exist", () => {
  const raw = [
    {noStr: true},
    {str: "Alpha ", width: 30, transform: [1, 0, 0, 10, 0, 40]},
    {str: "Beta", width: 24, transform: [1, 0, 0, 10, 30, 40]}
  ];
  const map = reconstructPageWithMap(raw);
  const start = map.text.indexOf("Beta");
  const aligned = alignPageLocalRange(map, map.text, start, start + 4);
  assert.equal(aligned.ok, true);
  if (!aligned.ok) return;
  assert.equal(aligned.itemSpans[0]?.itemIndex, 2);
});

test("4. citation spanning two PDF pages via canonical boundaries", () => {
  const pages = [
    {pageIndex: 0, text: "Start of clause continuing across"},
    {pageIndex: 1, text: "the page boundary toward the end."}
  ];
  const source = createCanonicalSource(pages);
  const quote = "continuing across\nthe page boundary";
  const verified = verifyQuote(source, quote);
  assert.equal(verified.verified, true);
  const occ = verified.occurrences[0]!;
  const ranges = splitCanonicalRange(source.pages, occ.start, occ.end);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0]!.pageIndex, 0);
  assert.equal(ranges[1]!.pageIndex, 1);
});

test("5-6. repeated quotation uses verified offsets not first match", () => {
  const phrase = "This Agreement shall remain in full force and effect.";
  const pages = [
    {pageIndex: 0, text: `Preamble. ${phrase} More text.`},
    {pageIndex: 1, text: `Later section. ${phrase} Closing.`}
  ];
  const source = createCanonicalSource(pages);
  const verified = verifyQuote(source, phrase);
  assert.equal(verified.verified, true);
  assert.ok(verified.occurrences.length >= 2);
  const second = verified.occurrences[1]!;
  const indices = pageIndicesForRange(source.pages, second.start, second.end);
  assert.deepEqual(indices, [1]);
  // First occurrence stays on page 0
  assert.deepEqual(pageIndicesForRange(source.pages, verified.occurrences[0]!.start, verified.occurrences[0]!.end), [0]);
});

test("7. sequential citations locate independently", () => {
  const pages = [{pageIndex: 0, text: "Alpha clause here. Beta clause there."}];
  const source = createCanonicalSource(pages);
  const a = verifyQuote(source, "Alpha clause here");
  const b = verifyQuote(source, "Beta clause there");
  assert.ok(a.verified && b.verified);
  assert.notEqual(a.occurrences[0]!.start, b.occurrences[0]!.start);
});

test("8. canonical offsets match source text", () => {
  const source = createCanonicalSource([{pageIndex: 0, text: "Exact liability amount AED 50,000 applies."}]);
  const v = verifyQuote(source, "AED 50,000");
  assert.equal(v.verified, true);
  const occ = v.occurrences[0]!;
  assert.equal(source.text.slice(occ.start, occ.end), occ.exactSourceText);
  assert.match(occ.exactSourceText, /AED 50,000/);
});

test("9. Unicode and UTF-16 offsets", () => {
  // Smile is one code point but two UTF-16 code units.
  const source = createCanonicalSource([{pageIndex: 0, text: "Party A 😀 Party B liability."}]);
  const v = verifyQuote(source, "Party B liability");
  assert.equal(v.verified, true);
  const occ = v.occurrences[0]!;
  assert.equal(source.text.slice(occ.start, occ.end), "Party B liability");
  assert.ok(occ.start > 2); // after emoji
});

test("10. whitespace normalization preserves mapping", () => {
  const canonical = "Fee   is\nAED 1,000.";
  const items = [
    {str: "Fee", width: 20, transform: [1, 0, 0, 10, 0, 80]},
    {str: "is", width: 12, transform: [1, 0, 0, 10, 30, 80]},
    {str: "AED 1,000.", width: 50, transform: [1, 0, 0, 10, 0, 60]}
  ];
  const map = reconstructPageWithMap(items);
  // Force whitespace-tolerant path by using different spacing in canonical.
  const start = canonical.indexOf("AED");
  const end = start + "AED 1,000.".length;
  const aligned = alignPageLocalRange(map, canonical, start, end);
  assert.equal(aligned.ok, true);
  if (!aligned.ok) return;
  assert.match(aligned.quote, /AED 1,000/);
});

test("11. ligature-like item still maps contiguous chars", () => {
  const items = [{str: "office", width: 40, transform: [1, 0, 0, 10, 0, 40]}];
  const map = reconstructPageWithMap(items);
  const aligned = alignPageLocalRange(map, "office", 0, 6);
  assert.equal(aligned.ok, true);
});

test("12. changed contractual numbers do not false-align", () => {
  const items = [{str: "AED 100,000", width: 60, transform: [1, 0, 0, 10, 0, 40]}];
  const map = reconstructPageWithMap(items);
  // Canonical claims a different amount than rendered page.
  const aligned = alignPageLocalRange(map, "AED 100,001 total", 0, "AED 100,001".length);
  assert.equal(aligned.ok, false);
});

test("13. incorrect source offsets fail honestly", () => {
  const map = reconstructPageWithMap([{str: "hello", width: 20, transform: [1, 0, 0, 10, 0, 10]}]);
  const aligned = alignPageLocalRange(map, "hello", 0, 50);
  assert.equal(aligned.ok, false);
  if (aligned.ok) return;
  assert.equal(aligned.reason, "OUT_OF_BOUNDS");
});

test("14. citation belonging to another document rejected", () => {
  const pages = createCanonicalSource([{pageIndex: 0, text: "Shared phrase elsewhere."}]).pages;
  const result = locateCitationOnPdf({
    documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    citationDocumentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    startOffset: 0,
    endOffset: 5,
    pages,
    canonicalPageText: new Map([[0, "Shared phrase elsewhere."]]),
    pageMaps: new Map([[0, reconstructPageWithMap([{str: "Shared phrase elsewhere.", width: 100, transform: [1, 0, 0, 10, 0, 10]}])]])
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "WRONG_DOCUMENT");
});

test("15. missing page map reports fallback page", () => {
  const source = createCanonicalSource([{pageIndex: 0, text: "Only page text."}]);
  const v = verifyQuote(source, "Only page");
  const occ = v.occurrences[0]!;
  const result = locateCitationOnPdf({
    documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    citationDocumentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    startOffset: occ.start,
    endOffset: occ.end,
    pages: source.pages,
    canonicalPageText: new Map([[0, "Only page text."]]),
    pageMaps: new Map()
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "MISSING_PAGE_MAP");
  assert.equal(result.fallbackPageIndex, 0);
});

test("16. empty page alignment fails without fake highlight", () => {
  const map = reconstructPageWithMap([]);
  const aligned = alignPageLocalRange(map, "text", 0, 4);
  assert.equal(aligned.ok, false);
  if (aligned.ok) return;
  assert.equal(aligned.reason, "EMPTY_PAGE");
});

test("17. highlight alignment failure when render diverges completely", () => {
  const map = reconstructPageWithMap([{str: "ZZZZ unrelated", width: 80, transform: [1, 0, 0, 10, 0, 10]}]);
  const aligned = alignPageLocalRange(map, "Completely different canonical page text.", 0, 20);
  assert.equal(aligned.ok, false);
});

test("22. reloaded historical citation derives pages from offsets", () => {
  const source = createCanonicalSource([
    {pageIndex: 0, text: "Page zero body."},
    {pageIndex: 1, text: "Target phrase on page one."}
  ]);
  const v = verifyQuote(source, "Target phrase");
  const occ = v.occurrences[0]!;
  // Simulate persisted citation with empty pageIndices
  const derived = pageIndicesForRange(source.pages, occ.start, occ.end);
  assert.deepEqual(derived, [1]);
});

test("24. empty or malformed citation metadata rejected", () => {
  const pages = createCanonicalSource([{pageIndex: 0, text: "abc"}]).pages;
  const result = locateCitationOnPdf({
    documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    citationDocumentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    startOffset: 5,
    endOffset: 2,
    pages,
    canonicalPageText: new Map([[0, "abc"]]),
    pageMaps: new Map([[0, reconstructPageWithMap([{str: "abc", width: 10, transform: [1, 0, 0, 10, 0, 10]}])]])
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "INVALID_OFFSETS");
});

test("fixture PDF: extract + locate known phrase (integration)", async () => {
  const buffer = readFileSync(resolve(root, "fixtures/phase1-sample.pdf"));
  const extracted = await extractDocument(buffer, "application/pdf");
  const source = createCanonicalSource(extracted.pages);
  assert.ok(source.text.length > 0);

  // Prefer a short distinctive token from the sample when present.
  const needle = source.text.match(/[A-Za-z]{5,}/)?.[0] ?? source.text.slice(0, 12).trim();
  assert.ok(needle.length >= 3);
  const verified = verifyQuote(source, needle);
  assert.equal(verified.verified, true);
  const occ = verified.occurrences[0]!;

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false}).promise;
  try {
    const pageMaps = new Map();
    const canonicalPageText = new Map();
    for (const page of extracted.pages) {
      canonicalPageText.set(page.pageIndex, page.text);
      const pdfPage = await pdf.getPage(page.pageIndex + 1);
      const content = await pdfPage.getTextContent();
      pageMaps.set(page.pageIndex, reconstructPageWithMap(content.items));
    }
    const located = locateCitationOnPdf({
      documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      citationDocumentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      startOffset: occ.start,
      endOffset: occ.end,
      pages: source.pages,
      canonicalPageText,
      pageMaps
    });
    assert.equal(located.ok, true, located.ok ? "" : `${located.reason} ${located.detail ?? ""}`);
    if (!located.ok) return;
    assert.ok(located.pages.length >= 1);
    assert.ok(located.pages[0]!.itemSpans.length >= 1);
  } finally {
    await pdf.destroy();
  }
});

test("150-page fixture: page boundary near end is addressable without full render", async () => {
  const buffer = readFileSync(resolve(root, "fixtures/phase1-large-150.pdf"));
  const extracted = await extractDocument(buffer, "application/pdf");
  assert.ok((extracted.pageCount ?? 0) >= 100);
  const source = createCanonicalSource(extracted.pages);
  const last = extracted.pages.at(-1)!;
  assert.ok(last.text.length > 0);
  const token = last.text.match(/[A-Za-z0-9]{4,}/)?.[0] ?? last.text.trim().slice(0, 8);
  const verified = verifyQuote(source, token);
  assert.equal(verified.verified, true);
  const occ = verified.occurrences.find(o => o.pageIndices.includes(last.pageIndex)) ?? verified.occurrences[0]!;
  const indices = pageIndicesForRange(source.pages, occ.start, occ.end);
  assert.ok(indices.includes(last.pageIndex));
  // Windowing helper: only need the target page index, not 0..N
  assert.ok(Math.max(...indices) >= (extracted.pageCount ?? 0) - 5);
});
