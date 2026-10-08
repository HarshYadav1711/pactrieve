import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {
  MAX_BYTES,
  DOCUMENT_TYPES,
  uploadInputSchema,
  checkFileSignature,
  assertDocxPackage,
  listZipEntryNames
} from "../src/lib/documents/validate.ts";

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");

test("accepts matching PDF metadata under the size limit", () => {
  const parsed = uploadInputSchema.safeParse({
    name: "msa.pdf",
    mimeType: DOCUMENT_TYPES.pdf,
    sizeBytes: 1024
  });
  assert.equal(parsed.success, true);
});

test("rejects extension and MIME mismatches", () => {
  assert.equal(uploadInputSchema.safeParse({
    name: "notes.txt",
    mimeType: DOCUMENT_TYPES.pdf,
    sizeBytes: 12
  }).success, false);
  assert.equal(uploadInputSchema.safeParse({
    name: "legacy.doc",
    mimeType: DOCUMENT_TYPES.docx,
    sizeBytes: 12
  }).success, false);
});

test("rejects empty and oversized uploads at the schema boundary", () => {
  assert.equal(uploadInputSchema.safeParse({
    name: "a.pdf",
    mimeType: DOCUMENT_TYPES.pdf,
    sizeBytes: 0
  }).success, false);
  assert.equal(uploadInputSchema.safeParse({
    name: "a.pdf",
    mimeType: DOCUMENT_TYPES.pdf,
    sizeBytes: MAX_BYTES + 1
  }).success, false);
});

test("rejects invalid PDF signatures and empty buffers", () => {
  assert.throws(() => checkFileSignature(Buffer.from("not-a-pdf"), DOCUMENT_TYPES.pdf), /PDF signature/);
  assert.throws(() => checkFileSignature(Buffer.alloc(0), DOCUMENT_TYPES.pdf), /empty/i);
  assert.doesNotThrow(() => checkFileSignature(readFileSync(resolve(fixtures, "phase1-sample.pdf")), DOCUMENT_TYPES.pdf));
});

test("rejects ZIP archives that are not OOXML Word documents", () => {
  const fake = readFileSync(resolve(fixtures, "phase1-fake.docx"));
  assert.ok(listZipEntryNames(fake).includes("readme.txt"));
  assert.throws(() => assertDocxPackage(fake), /Content_Types|word\/document\.xml/);
});

test("accepts a minimal OOXML DOCX package", () => {
  const docx = readFileSync(resolve(fixtures, "phase1-sample.docx"));
  assert.doesNotThrow(() => assertDocxPackage(docx));
  assert.doesNotThrow(() => checkFileSignature(docx, DOCUMENT_TYPES.docx));
});

test("flags PDFs that declare an Encrypt dictionary", () => {
  const encrypted = Buffer.from("%PDF-1.4\ntrailer<< /Encrypt 9 0 R /Root 1 0 R >>\n%%EOF");
  assert.throws(() => checkFileSignature(encrypted, DOCUMENT_TYPES.pdf), /password-protected|encrypted/i);
});
