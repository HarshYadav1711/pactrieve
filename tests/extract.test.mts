import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {extractDocument} from "../src/lib/documents/extract.ts";
import {DOCUMENT_TYPES} from "../src/lib/documents/validate.ts";
import {createCanonicalSource, verifyQuote} from "../src/lib/evidence/verify.ts";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");

test("extracts readable PDF text with page indexes", async () => {
  const buffer = readFileSync(resolve(fixtures, "phase1-sample.pdf"));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.pdf);
  assert.equal(extracted.pageCount, 1);
  assert.equal(extracted.pages.length, 1);
  assert.equal(extracted.pages[0].pageIndex, 0);
  assert.match(extracted.pages[0].text, /AED 100,000/);
});

test("rejects scanned PDFs with no readable text", async () => {
  const buffer = readFileSync(resolve(fixtures, "phase1-scanned.pdf"));
  await assert.rejects(() => extractDocument(buffer, DOCUMENT_TYPES.pdf), /no readable text|scanned/i);
});

test("flags partially unreadable PDFs without failing the whole document", async () => {
  const buffer = readFileSync(resolve(fixtures, "phase1-partial.pdf"));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.pdf);
  assert.equal(extracted.pageCount, 2);
  assert.equal(extracted.unreadablePageCount, 1);
  assert.match(extracted.pages[0].text, /Readable page one/);
  assert.equal(extracted.pages[1].text, "");
});

test("extracts DOCX paragraphs, table cells and split runs", async () => {
  const buffer = readFileSync(resolve(fixtures, "phase1-sample.docx"));
  const extracted = await extractDocument(buffer, DOCUMENT_TYPES.docx);
  assert.equal(extracted.pageCount, null);
  assert.equal(extracted.pages.length, 1);
  assert.match(extracted.pages[0].text, /Termination requires 30 days/);
  assert.match(extracted.pages[0].text, /Liability/);
  assert.match(extracted.pages[0].text, /AED 100,000/);
  assert.match(extracted.pages[0].text, /INR 5,000/);
});

test("rejects invalid PDF and DOCX packages before ready status", async () => {
  await assert.rejects(
    () => extractDocument(readFileSync(resolve(fixtures, "phase1-fake.pdf")), DOCUMENT_TYPES.pdf),
    /PDF signature/
  );
  await assert.rejects(
    () => extractDocument(readFileSync(resolve(fixtures, "phase1-fake.docx")), DOCUMENT_TYPES.docx),
    /Content_Types|Word document|document\.xml/
  );
});

test("canonical offsets from extracted fixtures still verify quotes", async () => {
  const pdf = await extractDocument(readFileSync(resolve(fixtures, "phase1-sample.pdf")), DOCUMENT_TYPES.pdf);
  const source = createCanonicalSource(pdf.pages);
  const matched = verifyQuote(source, "Liability Cap AED 100,000.");
  assert.equal(matched.verified, true);
});
