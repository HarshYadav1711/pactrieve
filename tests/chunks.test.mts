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
