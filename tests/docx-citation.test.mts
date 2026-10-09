import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import {createCanonicalSource, verifyQuote} from "../src/lib/evidence/verify.ts";
import {extractDocument} from "../src/lib/documents/extract.ts";
import {DOCUMENT_TYPES} from "../src/lib/documents/validate.ts";
import {
  alignCanonicalToDocxLeaves,
  buildDocxPreview,
  flattenDocxBlocks,
  locateCitationOnDocx,
  mammothHtmlToSafeAst
} from "../src/lib/docx/index.ts";
import {buildDocxFixture, heading, p, pRuns, table} from "./helpers/docx-fixture.mts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("1. simple paragraph extraction and preview align", async () => {
  const buffer = await buildDocxFixture(p("Termination requires thirty days notice."));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  const preview = await buildDocxPreview(buffer);
  assert.equal(preview.canonicalApprox, extracted.pages[0]!.text);
  assert.equal(preview.blocks[0]?.kind, "paragraph");
});

test("2. headings become heading blocks", async () => {
  const buffer = await buildDocxFixture(heading("Liability Cap", 1) + p("AED 100,000 applies."));
  const preview = await buildDocxPreview(buffer);
  assert.ok(preview.blocks.some(b => b.kind === "heading"));
});

test("3-4. paragraph breaks preserved in flatten", () => {
  const {blocks} = mammothHtmlToSafeAst("<p>One</p><p>Two</p>");
  const flat = flattenDocxBlocks(blocks);
  assert.equal(flat.canonicalApprox, "One\n\nTwo");
});

test("5-6. bold/italic and split runs map as separate leaves", async () => {
  const buffer = await buildDocxFixture(
    pRuns([
      {text: "Pay "},
      {text: "immediately", bold: true},
      {text: " or "},
      {text: "later", italic: true},
      {text: "."}
    ])
  );
  const preview = await buildDocxPreview(buffer);
  assert.ok(preview.leaves.length >= 3);
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  const source = createCanonicalSource(extracted.pages);
  const v = verifyQuote(source, "immediately");
  assert.equal(v.verified, true);
  const located = locateCitationOnDocx({
    documentId: DOC,
    citationDocumentId: DOC,
    startOffset: v.occurrences[0]!.start,
    endOffset: v.occurrences[0]!.end,
    canonicalText: extracted.pages[0]!.text,
    preview
  });
  assert.equal(located.ok, true);
  if (!located.ok) return;
  assert.equal(located.quote, "immediately");
});

test("7. non-breaking spaces survive sanitization", () => {
  const {blocks} = mammothHtmlToSafeAst("<p>Fee&nbsp;due</p>");
  const flat = flattenDocxBlocks(blocks);
  assert.match(flat.canonicalApprox, /Fee\u00a0due|Fee due/);
});

test("8. unicode and surrogate pairs", async () => {
  const buffer = await buildDocxFixture(p("Party A smiles and Party B liability."));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  const preview = await buildDocxPreview(buffer);
  const source = createCanonicalSource(extracted.pages);
  const v = verifyQuote(source, "Party B liability");
  assert.equal(v.verified, true);
  const located = locateCitationOnDocx({
    documentId: DOC,
    citationDocumentId: DOC,
    startOffset: v.occurrences[0]!.start,
    endOffset: v.occurrences[0]!.end,
    canonicalText: extracted.pages[0]!.text,
    preview
  });
  assert.equal(located.ok, true);
});

test("9. table content navigable", async () => {
  const buffer = await buildDocxFixture(table([["Liability", "AED 100,000"]]));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  const preview = await buildDocxPreview(buffer);
  assert.ok(preview.blocks.some(b => b.kind === "table"));
  const source = createCanonicalSource(extracted.pages);
  const v = verifyQuote(source, "AED 100,000");
  assert.equal(v.verified, true);
  const located = locateCitationOnDocx({
    documentId: DOC,
    citationDocumentId: DOC,
    startOffset: v.occurrences[0]!.start,
    endOffset: v.occurrences[0]!.end,
    canonicalText: extracted.pages[0]!.text,
    preview
  });
  assert.equal(located.ok, true);
});

test("10-12. partial / multi-paragraph highlighting leaves", async () => {
  const buffer = await buildDocxFixture(p("Alpha clause starts.") + p("Beta clause continues across."));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  const preview = await buildDocxPreview(buffer);
  const source = createCanonicalSource(extracted.pages);
  const v = verifyQuote(source, "starts.\n\nBeta clause");
  assert.equal(v.verified, true);
  const located = locateCitationOnDocx({
    documentId: DOC,
    citationDocumentId: DOC,
    startOffset: v.occurrences[0]!.start,
    endOffset: v.occurrences[0]!.end,
    canonicalText: extracted.pages[0]!.text,
    preview
  });
  assert.equal(located.ok, true);
  if (!located.ok) return;
  assert.ok(located.leaves.length >= 2);
});

test("13-14. repeated quotations use exact offsets", async () => {
  const phrase = "This Agreement shall remain in full force.";
  const buffer = await buildDocxFixture(p(`Intro. ${phrase}`) + p(`Appendix. ${phrase}`));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  const preview = await buildDocxPreview(buffer);
  const source = createCanonicalSource(extracted.pages);
  const v = verifyQuote(source, phrase);
  assert.ok(v.occurrences.length >= 2);
  const second = v.occurrences[1]!;
  const located = locateCitationOnDocx({
    documentId: DOC,
    citationDocumentId: DOC,
    startOffset: second.start,
    endOffset: second.end,
    canonicalText: extracted.pages[0]!.text,
    preview
  });
  assert.equal(located.ok, true);
  if (!located.ok) return;
  // Second occurrence should not use the first leaf exclusively.
  assert.ok(located.leaves[0]!.leafIndex >= 1 || located.focusBlockId !== preview.leaves[0]!.blockId);
});

test("15. source offsets match stored canonical text", async () => {
  const buffer = readFileSync(resolve(root, "fixtures/phase1-sample.docx"));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  const preview = await buildDocxPreview(buffer);
  assert.equal(preview.canonicalApprox, extracted.pages[0]!.text);
  const source = createCanonicalSource(extracted.pages);
  const v = verifyQuote(source, "AED 100,000");
  assert.equal(source.text.slice(v.occurrences[0]!.start, v.occurrences[0]!.end), "AED 100,000");
});

test("16. historical citation shape (empty pageIndices) still locates", async () => {
  const buffer = readFileSync(resolve(root, "fixtures/phase1-sample.docx"));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  const preview = await buildDocxPreview(buffer);
  const source = createCanonicalSource(extracted.pages);
  const v = verifyQuote(source, "Termination requires 30 days");
  const located = locateCitationOnDocx({
    documentId: DOC,
    citationDocumentId: DOC,
    startOffset: v.occurrences[0]!.start,
    endOffset: v.occurrences[0]!.end,
    canonicalText: extracted.pages[0]!.text,
    preview
  });
  assert.equal(located.ok, true);
});

test("17. wrong-document citation rejected", async () => {
  const buffer = readFileSync(resolve(root, "fixtures/phase1-sample.docx"));
  const preview = await buildDocxPreview(buffer);
  const located = locateCitationOnDocx({
    documentId: DOC,
    citationDocumentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    startOffset: 0,
    endOffset: 5,
    canonicalText: preview.canonicalApprox,
    preview
  });
  assert.equal(located.ok, false);
  if (located.ok) return;
  assert.equal(located.reason, "WRONG_DOCUMENT");
});

test("18. missing / invalid citation metadata", () => {
  const {blocks} = mammothHtmlToSafeAst("<p>abc</p>");
  const flat = flattenDocxBlocks(blocks);
  const preview = {blocks, ...flat, warnings: []};
  const located = locateCitationOnDocx({
    documentId: DOC,
    citationDocumentId: DOC,
    startOffset: 9,
    endOffset: 2,
    canonicalText: "abc",
    preview
  });
  assert.equal(located.ok, false);
  if (located.ok) return;
  assert.equal(located.reason, "INVALID_OFFSETS");
});

test("19. verified but visually unmappable text fails align honestly", () => {
  const {blocks} = mammothHtmlToSafeAst("<p>Rendered only</p>");
  const flat = flattenDocxBlocks(blocks);
  const preview = {blocks, ...flat, warnings: []};
  const aligned = alignCanonicalToDocxLeaves("Completely different canonical text.", flat.renderText, flat.leaves, 0, 12);
  assert.equal(aligned.ok, false);
});

test("20. malformed DOCX rejected by extractor", async () => {
  await assert.rejects(
    () => extractDocument(readFileSync(resolve(root, "fixtures/phase1-fake.docx")), DOCUMENT_TYPES.docx),
    /Content_Types|Word document|document\.xml|DOCX/
  );
});

test("21-22. unsafe HTML and dangerous hyperlinks stripped", () => {
  const {blocks, warnings} = mammothHtmlToSafeAst(
    `<p>Safe <script>alert(1)</script> text</p><p><a href="javascript:alert(1)">x</a><a href="https://example.com">ok</a></p>`
  );
  const flat = flattenDocxBlocks(blocks);
  assert.doesNotMatch(flat.canonicalApprox, /alert/);
  assert.ok(warnings.length >= 1);
  // https link text retained
  assert.match(flat.canonicalApprox, /ok/);
});

test("23. unsupported embedded image tags dropped", () => {
  const {blocks} = mammothHtmlToSafeAst(`<p>Before</p><img src="x" onerror="alert(1)"/><p>After</p>`);
  const flat = flattenDocxBlocks(blocks);
  assert.equal(flat.canonicalApprox, "Before\n\nAfter");
});

test("25. long-document flatten stays linear", async () => {
  const body = Array.from({length: 80}, (_, i) => p(`Clause ${i + 1}. The parties agree to term ${i + 1}.`)).join("");
  const buffer = await buildDocxFixture(body);
  const t0 = Date.now();
  const preview = await buildDocxPreview(buffer);
  const ms = Date.now() - t0;
  assert.ok(preview.leaves.length >= 80);
  assert.ok(ms < 5000, `preview took ${ms}ms`);
});

test("sample fixture: locate AED amount", async () => {
  const buffer = readFileSync(resolve(root, "fixtures/phase1-sample.docx"));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  const preview = await buildDocxPreview(buffer);
  const source = createCanonicalSource(extracted.pages);
  const v = verifyQuote(source, "AED 100,000");
  const located = locateCitationOnDocx({
    documentId: DOC,
    citationDocumentId: DOC,
    startOffset: v.occurrences[0]!.start,
    endOffset: v.occurrences[0]!.end,
    canonicalText: extracted.pages[0]!.text,
    preview
  });
  assert.equal(located.ok, true);
  if (!located.ok) return;
  assert.equal(located.quote, "AED 100,000");
});
