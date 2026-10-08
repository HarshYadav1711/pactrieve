/**
 * Phase 1 live Supabase ingestion smoke (synthetic fixtures only).
 * Usage: node --env-file=.env.local scripts/phase1-live-smoke.mjs
 * Does not print secrets.
 */
import {createClient} from "@supabase/supabase-js";
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "pactrieve-documents";
const base = process.env.PACTRIEVE_BASE_URL || "http://127.0.0.1:3000";

if (!url || !service || !anon) {
  console.error(JSON.stringify({ok: false, error: "Missing Supabase env"}));
  process.exit(1);
}

const db = createClient(url, service, {auth: {persistSession: false, autoRefreshToken: false}});
const results = [];

function record(name, pass, detail = {}) {
  results.push({name, pass, ...detail});
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail.error ? ` — ${detail.error}` : ""}`);
}

async function api(path, init) {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = {raw: text.slice(0, 200)}; }
  return {response, body};
}

async function uploadViaApi(filePath, name, mimeType) {
  const buffer = readFileSync(filePath);
  const initiated = await api("/api/documents/initiate", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({name, mimeType, sizeBytes: buffer.length})
  });
  if (!initiated.response.ok) {
    return {ok: false, stage: "initiate", status: initiated.response.status, body: initiated.body};
  }
  const browser = createClient(url, anon, {auth: {persistSession: false, autoRefreshToken: false}});
  const {error: uploadError} = await browser.storage.from(initiated.body.bucket)
    .uploadToSignedUrl(initiated.body.uploadPath, initiated.body.uploadToken, buffer, {contentType: mimeType});
  if (uploadError) {
    return {ok: false, stage: "storage", error: uploadError.message, documentId: initiated.body.documentId};
  }
  const processing = await api(`/api/documents/${initiated.body.documentId}/process`, {method: "POST"});
  return {
    ok: processing.response.ok,
    stage: "process",
    status: processing.response.status,
    body: processing.body,
    documentId: initiated.body.documentId,
    sizeBytes: buffer.length
  };
}

async function assertCleanup(documentId, storagePath) {
  const {data: doc} = await db.from("documents").select("id").eq("id", documentId).maybeSingle();
  const {data: pages} = await db.from("document_pages").select("page_index").eq("document_id", documentId);
  const {data: chunks} = await db.from("document_chunks").select("id").eq("document_id", documentId);
  const listed = await db.storage.from(bucket).list("documents", {search: storagePath.split("/").pop()});
  const stillInStorage = (listed.data || []).some(f => storagePath.endsWith(f.name));
  return {
    documentGone: !doc,
    pagesGone: !(pages && pages.length),
    chunksGone: !(chunks && chunks.length),
    storageGone: !stillInStorage
  };
}

try {
  // Health: list documents
  const list = await api("/api/documents");
  record("GET /api/documents", list.response.ok, {count: list.body.documents?.length});

  // Invalid initiate: txt as pdf extension mismatch handled by mime from client - send mismatch
  const badMime = await api("/api/documents/initiate", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({name: "notes.txt", mimeType: "application/pdf", sizeBytes: 12})
  });
  record("reject extension/MIME mismatch", badMime.response.status === 400, {status: badMime.response.status, error: badMime.body.error});

  const oversized = await api("/api/documents/initiate", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({name: "big.pdf", mimeType: "application/pdf", sizeBytes: 31 * 1024 * 1024})
  });
  record("reject oversized metadata", oversized.response.status === 400, {status: oversized.response.status});

  const emptyMeta = await api("/api/documents/initiate", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({name: "empty.pdf", mimeType: "application/pdf", sizeBytes: 0})
  });
  record("reject empty size", emptyMeta.response.status === 400, {status: emptyMeta.response.status});

  // Fresh PDF
  const pdf = await uploadViaApi(resolve(root, "fixtures/phase1-sample.pdf"), "phase1-sample.pdf", "application/pdf");
  record("fresh PDF upload+process", pdf.ok && pdf.body?.status === "ready", {documentId: pdf.documentId, body: pdf.body, error: pdf.body?.error || pdf.error});

  let pdfTextOk = false;
  if (pdf.documentId && pdf.ok) {
    const text = await api(`/api/documents/${pdf.documentId}/text`);
    pdfTextOk = text.response.ok && typeof text.body.source?.text === "string" && text.body.source.text.length > 0;
    record("reopen PDF extracted text", pdfTextOk, {chars: text.body.source?.text?.length, pages: text.body.document?.page_count});
    const twice = await api(`/api/documents/${pdf.documentId}/process`, {method: "POST"});
    record("duplicate process on ready rejected", twice.response.status === 409, {status: twice.response.status});
  } else {
    record("reopen PDF extracted text", false, {error: "skipped"});
    record("duplicate process on ready rejected", false, {error: "skipped"});
  }

  // Fake PDF signature after upload
  const fakePdf = await uploadViaApi(resolve(root, "fixtures/phase1-fake.pdf"), "phase1-fake.pdf", "application/pdf");
  record("fake PDF fails processing", !fakePdf.ok && fakePdf.status === 422, {status: fakePdf.status, error: fakePdf.body?.error});

  // Scanned / no text
  const scanned = await uploadViaApi(resolve(root, "fixtures/phase1-scanned.pdf"), "phase1-scanned.pdf", "application/pdf");
  record("scanned PDF fails clearly", !scanned.ok && scanned.status === 422, {status: scanned.status, error: scanned.body?.error, codeHint: scanned.body});

  // Partial unreadable should succeed with warning count
  const partial = await uploadViaApi(resolve(root, "fixtures/phase1-partial.pdf"), "phase1-partial.pdf", "application/pdf");
  record("partial PDF ready with unreadable pages", partial.ok && (partial.body?.unreadablePages ?? 0) > 0, {body: partial.body, error: partial.body?.error});

  // DOCX
  const docx = await uploadViaApi(resolve(root, "fixtures/phase1-sample.docx"), "phase1-sample.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  record("fresh DOCX upload+process", docx.ok && docx.body?.status === "ready", {documentId: docx.documentId, body: docx.body, error: docx.body?.error || docx.error});

  if (docx.documentId && docx.ok) {
    const text = await api(`/api/documents/${docx.documentId}/text`);
    const hasTableText = /Liability|AED 100,000|Termination/i.test(text.body.source?.text || "");
    record("reopen DOCX with table/run text", text.response.ok && hasTableText, {chars: text.body.source?.text?.length, preview: (text.body.source?.text || "").slice(0, 120)});
  } else {
    record("reopen DOCX with table/run text", false, {error: "skipped"});
  }

  // Fake DOCX zip
  const fakeDocx = await uploadViaApi(resolve(root, "fixtures/phase1-fake.docx"), "phase1-fake.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  record("invalid DOCX structure fails", !fakeDocx.ok && fakeDocx.status === 422, {status: fakeDocx.status, error: fakeDocx.body?.error});

  // Persistence across list
  const list2 = await api("/api/documents");
  const ids = (list2.body.documents || []).map(d => d.id);
  record("library persistence after uploads", list2.response.ok && (!!pdf.documentId ? ids.includes(pdf.documentId) : true), {count: ids.length});

  // Delete ready PDF and verify cleanup
  if (pdf.documentId && pdf.ok) {
    const {data: before} = await db.from("documents").select("storage_path").eq("id", pdf.documentId).maybeSingle();
    const del = await api(`/api/documents/${pdf.documentId}`, {method: "DELETE"});
    const cleanup = before ? await assertCleanup(pdf.documentId, before.storage_path) : null;
    record("delete PDF cleans DB+storage", del.response.ok && cleanup?.documentGone && cleanup?.pagesGone && cleanup?.chunksGone && cleanup?.storageGone, {cleanup, status: del.response.status});
    const del2 = await api(`/api/documents/${pdf.documentId}`, {method: "DELETE"});
    record("repeated delete predictable", del2.response.status === 404 || del2.response.ok, {status: del2.response.status, error: del2.body?.error});
  } else {
    record("delete PDF cleans DB+storage", false, {error: "skipped"});
    record("repeated delete predictable", false, {error: "skipped"});
  }

  // Cleanup remaining smoke docs
  for (const id of [fakePdf.documentId, scanned.documentId, partial.documentId, docx.documentId, fakeDocx.documentId].filter(Boolean)) {
    await api(`/api/documents/${id}`, {method: "DELETE"});
  }
} catch (e) {
  record("uncaught", false, {error: e instanceof Error ? e.message : String(e)});
}

const failed = results.filter(r => !r.pass);
console.log(JSON.stringify({ok: failed.length === 0, passed: results.filter(r => r.pass).length, failed: failed.length, results}, null, 2));
process.exit(failed.length ? 1 : 0);
