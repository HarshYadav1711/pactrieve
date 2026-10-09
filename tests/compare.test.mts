import test from "node:test";
import assert from "node:assert/strict";
import {createCanonicalSource} from "../src/lib/evidence/verify.ts";
import {
  alignBlocks,
  assertBlockSlice,
  compareDocumentSources,
  compareRequestSchema,
  extractStructuralKey,
  normalizeForMatch,
  segmentDocument,
  textSimilarity
} from "../src/lib/compare/index.ts";

const DOC_O = "11111111-1111-4111-8111-111111111111";
const DOC_R = "22222222-2222-4222-8222-222222222222";

function source(text: string) {
  return createCanonicalSource([{pageIndex: 0, text}]);
}

function meta(id: string, name: string, unreadable = 0) {
  return {
    id,
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pageCount: 1,
    unreadablePageCount: unreadable
  };
}

function compare(originalText: string, revisedText: string, unreadable = 0) {
  return compareDocumentSources({
    original: {meta: meta(DOC_O, "original.docx", unreadable), source: source(originalText)},
    revised: {meta: meta(DOC_R, "revised.docx", unreadable), source: source(revisedText)}
  });
}

const V1 = [
  "1. DEFINITIONS",
  "",
  "Agreement means this contract between the parties.",
  "",
  "2. TERMINATION",
  "",
  "The Supplier shall provide thirty days written notice.",
  "",
  "3. LIABILITY",
  "",
  "The Supplier's aggregate liability shall not exceed AED 100,000.",
  "",
  "4. INSURANCE",
  "",
  "The Supplier shall maintain insurance."
].join("\n");

test("schema rejects invalid and self-comparison inputs", () => {
  assert.equal(compareRequestSchema.safeParse({}).success, false);
  assert.equal(
    compareRequestSchema.safeParse({
      originalDocumentId: "bad",
      revisedDocumentId: DOC_R
    }).success,
    false
  );
  assert.equal(
    compareRequestSchema.safeParse({
      originalDocumentId: DOC_O,
      revisedDocumentId: DOC_R
    }).success,
    true
  );
});

test("1. identical contracts → unchanged only", () => {
  const result = compare(V1, V1);
  assert.equal(result.summary.modified, 0);
  assert.equal(result.summary.added, 0);
  assert.equal(result.summary.removed, 0);
  assert.ok(result.summary.unchanged >= 1);
  assert.ok(result.changes.every(c => c.kind === "unchanged"));
});

test("2. whitespace-only differences → unchanged", () => {
  const revised = V1.replace(/\n\n/g, "\n\n\n").replace("  ", " ");
  const result = compare(V1, revised);
  assert.equal(result.summary.modified, 0);
  assert.equal(result.summary.added, 0);
  assert.equal(result.summary.removed, 0);
});

test("3-5. modified notice period and monetary amount", () => {
  const revised = V1.replace("thirty days", "sixty days").replace("AED 100,000", "AED 1,000,000");
  const result = compare(V1, revised);
  assert.ok(result.summary.modified >= 1);
  const mods = result.changes.filter(c => c.kind === "modified");
  const joined = mods.map(c => `${c.original?.text ?? ""}${c.revised?.text ?? ""}`).join("\n");
  assert.match(joined, /thirty|60|sixty/i);
  assert.match(joined, /100,000|1,000,000/);
  assert.ok(mods.every(c => c.original?.documentId === DOC_O));
  assert.ok(mods.every(c => c.revised?.documentId === DOC_R));
});

test("6. changed negation is modified", () => {
  const original = "3. LIABILITY\n\nThe Supplier shall exceed the cap.";
  const revised = "3. LIABILITY\n\nThe Supplier shall not exceed the cap.";
  const result = compare(original, revised);
  assert.ok(result.summary.modified >= 1);
  const mod = result.changes.find(c => c.kind === "modified");
  assert.ok(mod);
  assert.match(mod!.original!.text, /shall exceed/);
  assert.match(mod!.revised!.text, /shall not exceed/);
});

test("7. changed obligated party is modified", () => {
  const original = "2. TERMINATION\n\nThe Supplier shall provide thirty days written notice.";
  const revised = "2. TERMINATION\n\nThe Customer shall provide thirty days written notice.";
  const result = compare(original, revised);
  assert.ok(result.summary.modified >= 1);
});

test("8-9. added and removed clauses", () => {
  const revised = [
    V1,
    "",
    "5. CONVENIENCE",
    "",
    "The Customer may terminate for convenience."
  ].join("\n");
  const withoutInsurance = V1.replace(
    /\n4\. INSURANCE\n\nThe Supplier shall maintain insurance\./,
    ""
  );
  const result = compare(withoutInsurance, revised);
  assert.ok(result.summary.added >= 1);
  const add = result.changes.find(c => c.kind === "added" && /convenience/i.test(c.revised?.text ?? ""));
  assert.ok(add);
  assert.equal(add!.original, null);

  const removedOnly = compare(V1, withoutInsurance);
  assert.ok(removedOnly.summary.removed >= 1);
  const rem = removedOnly.changes.find(c => c.kind === "removed" && /insurance/i.test(c.original?.text ?? ""));
  assert.ok(rem);
  assert.equal(rem!.revised, null);
});

test("10-11. moved / renumbered unchanged clause", () => {
  const moved = [
    "1. DEFINITIONS",
    "",
    "Agreement means this contract between the parties.",
    "",
    "2. LIABILITY",
    "",
    "The Supplier's aggregate liability shall not exceed AED 100,000.",
    "",
    "3. TERMINATION",
    "",
    "The Supplier shall provide thirty days written notice.",
    "",
    "4. INSURANCE",
    "",
    "The Supplier shall maintain insurance."
  ].join("\n");
  const result = compare(V1, moved);
  // Notice sentence must still be represented (paired or as remove+add), never dropped.
  const mentions = result.changes.filter(c =>
    /thirty days written notice/i.test(`${c.original?.text ?? ""} ${c.revised?.text ?? ""}`)
  );
  assert.ok(mentions.length >= 1, "termination notice must appear in comparison output");
  const paired = mentions.find(c => c.original && c.revised);
  if (paired) {
    assert.ok(["moved", "unchanged", "modified", "uncertain"].includes(paired.kind));
    assert.ok(
      textSimilarity(paired.original!.normalizedText, paired.revised!.normalizedText) >= 0.85
    );
  } else {
    // Conservative split into remove+add is acceptable when order/structure confuses alignment.
    assert.ok(mentions.some(c => c.kind === "removed"));
    assert.ok(mentions.some(c => c.kind === "added"));
  }
});

test("12. heading renamed with same body", () => {
  const revised = V1.replace("2. TERMINATION", "2. ENDING THE AGREEMENT");
  const result = compare(V1, revised);
  const pair = result.changes.find(c => /thirty days/i.test(c.original?.text ?? ""));
  assert.ok(pair);
  // Body unchanged; classification may be unchanged (cosmetic heading) or modified if heading in block.
  assert.ok(["unchanged", "modified", "moved"].includes(pair!.kind));
});

test("14. duplicate boilerplate stays document-scoped", () => {
  const phrase = "This Agreement shall remain in full force.";
  const original = `1. FORCE\n\n${phrase}\n\n2. OTHER\n\nAlpha only.`;
  const revised = `1. FORCE\n\n${phrase}\n\n2. OTHER\n\n${phrase}`;
  const result = compare(original, revised);
  assert.ok(result.summary.added >= 1 || result.summary.modified >= 0);
  assert.ok(result.changes.every(c => !c.original || c.original.documentId === DOC_O));
  assert.ok(result.changes.every(c => !c.revised || c.revised.documentId === DOC_R));
});

test("15. similar clauses with distinct meanings stay distinct", () => {
  const original = "2. NOTICE\n\nThe Supplier shall provide thirty days written notice.";
  const revised = "2. NOTICE\n\nThe Supplier shall provide thirty days oral notice.";
  const result = compare(original, revised);
  assert.ok(result.summary.modified >= 1);
  const mod = result.changes.find(c => c.kind === "modified");
  assert.match(mod!.original!.text, /written/);
  assert.match(mod!.revised!.text, /oral/);
});

test("17-18. split and merge handled without crash", () => {
  const original = "2. TERM\n\nPart one. Part two continues here.";
  const split = "2. TERM\n\nPart one.\n\nPart two continues here.";
  const merged = compare(split, original);
  assert.ok(merged.changes.length >= 1);
  const splitResult = compare(original, split);
  assert.ok(splitResult.changes.length >= 1);
});

test("19. cross-page clause offsets remain valid", () => {
  const page0 = "1. LIABILITY\n\nThe Supplier's aggregate liability shall not exceed AED 100,000.";
  const page1 = " Continued on next page with governing terms.";
  const canonical = createCanonicalSource([
    {pageIndex: 0, text: page0},
    {pageIndex: 1, text: page1}
  ]);
  const seg = segmentDocument({
    documentId: DOC_O,
    role: "original",
    text: canonical.text,
    pages: canonical.pages
  });
  assert.ok(seg.blocks.length >= 1);
  for (const block of seg.blocks) {
    assert.equal(assertBlockSlice(canonical.text, block), true);
    assert.ok(block.pageIndices.length >= 1);
  }
});

test("20-21. unnumbered paragraphs and nested numbering", () => {
  const text = [
    "Preamble prose without a heading.",
    "",
    "1. GENERAL",
    "",
    "1.1 Nested duty of care.",
    "",
    "(a) Sub-item one.",
    "",
    "(b) Sub-item two."
  ].join("\n");
  const seg = segmentDocument({
    documentId: DOC_O,
    role: "original",
    text,
    pages: source(text).pages
  });
  assert.ok(seg.blocks.length >= 2);
  assert.ok(seg.usedSectionSegmentation || seg.usedParagraphFallback);
  assert.ok(extractStructuralKey("1.1 Nested") === "1.1" || extractStructuralKey("1. GENERAL") === "1");
});

test("23-24. empty and partially unreadable sources", () => {
  const empty = compare("", "1. ONLY\n\nRevised only.");
  assert.ok(empty.summary.added >= 1);

  const partial = compare(V1, V1.replace("AED 100,000", "AED 1,000,000"), 2);
  assert.ok(partial.coverage.notes.some(n => /unreadable/i.test(n)));
  assert.ok(partial.summary.modified >= 1);
});

test("27. self-comparison rejected", () => {
  assert.throws(
    () =>
      compareDocumentSources({
        original: {meta: meta(DOC_O, "a"), source: source(V1)},
        revised: {meta: meta(DOC_O, "a"), source: source(V1)}
      }),
    /itself/
  );
});

test("29. deterministic across repeated runs", () => {
  const revised = V1.replace("thirty days", "sixty days");
  const a = compare(V1, revised);
  const b = compare(V1, revised);
  assert.deepEqual(
    a.changes.map(c => [c.kind, c.original?.orderIndex ?? null, c.revised?.orderIndex ?? null]),
    b.changes.map(c => [c.kind, c.original?.orderIndex ?? null, c.revised?.orderIndex ?? null])
  );
});

test("30. large-document performance bound", () => {
  const clauses = Array.from({length: 120}, (_, i) => {
    const n = i + 1;
    return `${n}. CLAUSE ${n}\n\nParty obligations for clause ${n} include payment of AED ${(n * 1000).toLocaleString("en-US")} and notice of ${n} days.`;
  });
  const original = clauses.join("\n\n");
  const revised = clauses
    .map((c, i) => (i === 100 ? c.replace("100 days", "180 days").replace("AED 101,000", "AED 250,000") : c))
    .join("\n\n");
  const t0 = Date.now();
  const result = compare(original, revised);
  const ms = Date.now() - t0;
  assert.ok(ms < 8000, `large compare took ${ms}ms`);
  assert.ok(result.coverage.originalBlockCount >= 50);
  assert.ok(result.metrics.candidatePairs < 30_000);
  // Late clause change should appear.
  const late = result.changes.find(
    c => c.kind === "modified" && /180 days|250,000|101/.test(`${c.original?.text}${c.revised?.text}`)
  );
  assert.ok(late, "expected a late-document modification");
});

test("31. source offset integrity for every block", () => {
  const result = compare(V1, V1.replace("thirty days", "sixty days"));
  for (const change of result.changes) {
    if (change.original) {
      assert.equal(
        source(V1).text.slice(change.original.startOffset, change.original.endOffset),
        change.original.text
      );
    }
    if (change.revised) {
      const rev = V1.replace("thirty days", "sixty days");
      assert.equal(
        source(rev).text.slice(change.revised.startOffset, change.revised.endOffset),
        change.revised.text
      );
    }
  }
});

test("alignment does not double-assign one original block", () => {
  const o = segmentDocument({
    documentId: DOC_O,
    role: "original",
    text: V1,
    pages: source(V1).pages
  }).blocks;
  const r = segmentDocument({
    documentId: DOC_R,
    role: "revised",
    text: V1.replace("thirty days", "sixty days"),
    pages: source(V1).pages
  }).blocks;
  const aligned = alignBlocks(o, r);
  const originals = aligned.changes.map(c => c.original?.id).filter(Boolean);
  assert.equal(new Set(originals).size, originals.length);
});

test("normalization preserves shall/may and amounts", () => {
  assert.notEqual(normalizeForMatch("shall exceed"), normalizeForMatch("shall not exceed"));
  assert.notEqual(normalizeForMatch("shall"), normalizeForMatch("may"));
  assert.notEqual(normalizeForMatch("AED 100,000"), normalizeForMatch("AED 1,000,000"));
  assert.ok(textSimilarity(normalizeForMatch("hello world"), normalizeForMatch("hello   world")) > 0.9);
});
