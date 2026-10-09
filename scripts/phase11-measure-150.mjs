/**
 * Local timing for sparse 150-page fixture (not dense commercial PDF).
 */
import {readFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {fileURLToPath, pathToFileURL} from "node:url";
import {dirname, join} from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..");

const extractMod = await import(pathToFileURL(join(root, "src/lib/documents/extract.ts")).href);
const chunksMod = await import(pathToFileURL(join(root, "src/lib/documents/chunks.ts")).href);
const verifyMod = await import(pathToFileURL(join(root, "src/lib/evidence/verify.ts")).href);
const memoryMod = await import(pathToFileURL(join(root, "src/lib/retrieval/memory.ts")).href);

const buf = readFileSync(join(root, "fixtures/phase2-contract-150.pdf"));
const t0 = performance.now();
const extracted = await extractMod.extractDocument(buf, "application/pdf");
const tExtract = performance.now() - t0;
const source = verifyMod.createCanonicalSource(extracted.pages);
const t1 = performance.now();
const chunks = chunksMod.createChunks(source.text);
const tChunk = performance.now() - t1;
const t2 = performance.now();
const hit = memoryMod.searchMemoryDocument(
  {
    documentId: "00000000-0000-4000-8000-000000000150",
    text: source.text,
    pages: source.pages,
    chunks,
    unreadablePageCount: extracted.unreadablePageCount,
    pageCount: extracted.pageCount
  },
  "governing law",
  {limit: 5}
);
const tRet = performance.now() - t2;
const late = hit.passages?.[0];
const quote = typeof late?.text === "string" ? late.text : late?.content;
const verified =
  typeof quote === "string" && quote.length
    ? verifyMod.verifyQuote(source, quote)
    : null;
console.log(
  JSON.stringify(
    {
      pages: extracted.pageCount,
      unreadable: extracted.unreadablePageCount,
      extractMs: Math.round(tExtract),
      chunkMs: Math.round(tChunk),
      chunks: chunks.length,
      retrieveMs: Math.round(tRet),
      coverage: hit.coverage?.status ?? hit.coverage,
      passageKeys: late ? Object.keys(late) : [],
      firstQuote: typeof quote === "string" ? quote.slice(0, 100) : null,
      verifyOk: verified?.verified ?? null
    },
    null,
    2
  )
);
