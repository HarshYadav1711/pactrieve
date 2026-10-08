import test from "node:test";
import assert from "node:assert/strict";
import {createChunks} from "../src/lib/documents/chunks.ts";

test("chunks preserve offset slices of the original source",() => {
  const text = "a long section. ".repeat(260);
  const chunks = createChunks(text, 300, 50);
  assert.ok(chunks.length>1);
  for (const chunk of chunks) assert.equal(chunk.content, text.slice(chunk.startOffset,chunk.endOffset));
  assert.equal(chunks[0].startOffset,0);
  assert.equal(chunks.at(-1)?.endOffset,text.length);
});

test("empty and short sources create expected chunks",() => {
  assert.equal(createChunks("").length,0);
  assert.equal(createChunks("abc").length,1);
});

test("invalid chunk dimensions are rejected",() => {
  assert.throws(()=>createChunks("content",50,50));
});

test("structure-aware chunking keeps section labels on numbered clauses", () => {
  const text = "1. DEFINITIONS\nConfidential Information means secrets.\n\n8. LIMITATION OF LIABILITY\nCap is AED 100,000.\n\n8.2 Exceptions\nFraud is excluded.\n";
  const chunks = createChunks(text, 120, 20);
  assert.ok(chunks.some(chunk => chunk.sectionLabel && /LIMITATION|8\./i.test(chunk.sectionLabel)));
  for (const chunk of chunks) assert.equal(chunk.content, text.slice(chunk.startOffset, chunk.endOffset));
});
