import test from "node:test";
import assert from "node:assert/strict";
import {createCanonicalSource, verifyQuote, normalizeWithSourceMap} from "../src/lib/evidence/verify.ts";

const source = createCanonicalSource([
  {pageIndex: 0, text: "8. LIABILITY\nThe Supplier shall not exceed AED 100,000."},
  {pageIndex: 1, text: "Termination requires 30 days' written notice.\nRepeat: same clause. Repeat: same clause."}
]);

test("matches whitespace-normalized quotes to real source offsets", () => {
  const result = verifyQuote(source, "The   Supplier shall not exceed\nAED 100,000.");
  assert.equal(result.verified, true);
  assert.equal(result.occurrences[0].pageIndices[0], 0);
  assert.equal(result.occurrences[0].exactSourceText, "The Supplier shall not exceed AED 100,000.");
});

test("rejects hallucinated monetary values", () => {
  const result = verifyQuote(source, "The Supplier shall not exceed AED 1,000,000.");
  assert.equal(result.verified, false);
  assert.equal(result.reason, "NOT_FOUND");
});

test("rejects important contractual word changes", () => {
  assert.equal(verifyQuote(source, "The Supplier may not exceed AED 100,000.").verified, false);
});

test("supports quotes across page boundaries", () => {
  const result = verifyQuote(source, "AED 100,000.   Termination requires 30 days' written notice.");
  assert.equal(result.verified, true);
  assert.deepEqual(result.occurrences[0].pageIndices, [0, 1]);
});

test("returns each repeated quote occurrence instead of guessing the intended one", () => {
  const result = verifyQuote(source, "Repeat: same clause.");
  assert.equal(result.verified, true);
  assert.equal(result.occurrences.length, 2);
  assert.notEqual(result.occurrences[0].start, result.occurrences[1].start);
});

test("rejects empty or whitespace-only quotations", () => {
  assert.equal(verifyQuote(source, " \n  ").reason, "EMPTY_QUOTE");
});

test("mapping does not emit a trailing whitespace that is not present in the quote", () => {
  assert.deepEqual(normalizeWithSourceMap(" \t A  B \n"), {text: "A B", originalOffset: [3, 4, 6]});
});

test("does not treat another document as verified evidence", () => {
  const other = createCanonicalSource([{pageIndex: 0, text: "The cap is AED 2,000,000."}]);
  assert.equal(verifyQuote(other, "AED 100,000").verified, false);
});

test("matching source offsets preserve accented and Unicode characters", () => {
  const other = createCanonicalSource([{pageIndex: 0, text: "Party agrees to pay ₹5,000.\nCafé terms apply."}]);
  const matched = verifyQuote(other, "Café terms apply.");
  assert.equal(matched.verified, true);
  assert.equal(other.text.slice(matched.occurrences[0].start, matched.occurrences[0].end), "Café terms apply.");
});
