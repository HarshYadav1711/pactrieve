import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {serverSupabase, storageBucket} from "@/lib/supabase/server";
import {extractDocument} from "@/lib/documents/extract";
import {createCanonicalSource} from "@/lib/evidence/verify";
import {createChunks} from "@/lib/documents/chunks";
import {DOCUMENT_TYPES, type AllowedDocumentType} from "@/lib/documents/validate";

export const runtime = "nodejs";
/** Dense 150-page extraction can approach a minute; Vercel Hobby allows ≤300s. */
export const maxDuration = 120;

/** Reclaim stuck processing leases older than this window (sync serverless crash recovery). */
const STALE_PROCESSING_MS = 2 * 60 * 1000;

type RouteContext = {params: Promise<{id: string}>};

function publicFailure(message: string) {
  const isUnreadable = /no readable text|scanned\/image-only|No readable text/i.test(message);
  const isEncrypted = /password-protected|encrypted/i.test(message);
  const isInvalid = /not a valid|missing ZIP|missing PDF|corrupt|Word document|empty/i.test(message);
  if (isUnreadable) {
    return {
      code: "NO_READABLE_TEXT",
      message: "No readable text was extracted. Scanned PDFs require OCR, which is not supported yet."
    };
  }
  if (isEncrypted) {
    return {code: "ENCRYPTED_OR_PROTECTED", message};
  }
  if (isInvalid) {
    return {code: "INVALID_FILE", message};
  }
  return {
    code: "EXTRACTION_FAILED",
    message: "We could not process this file. It may be malformed, encrypted, or unsupported."
  };
}

async function claimForProcessing(db: ReturnType<typeof serverSupabase>, id: string) {
  const now = new Date().toISOString();
  const {data: reserved, error: reserveError} = await db.from("documents")
    .update({status: "processing", error_code: null, error_message: null, updated_at: now})
    .eq("id", id).in("status", ["uploading", "failed"])
    .select("id,mime_type,storage_path,size_bytes,status,updated_at").maybeSingle();
  if (reserveError) throw reserveError;
  if (reserved) return reserved;

  const {data: current, error} = await db.from("documents")
    .select("id,mime_type,storage_path,size_bytes,status,updated_at")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!current) return null;
  if (current.status === "ready") return {conflict: "ready" as const};
  if (current.status === "processing") {
    const age = Date.now() - new Date(current.updated_at).getTime();
    if (Number.isFinite(age) && age >= STALE_PROCESSING_MS) {
      const {data: reclaimed, error: reclaimError} = await db.from("documents")
        .update({status: "processing", error_code: null, error_message: null, updated_at: now})
        .eq("id", id).eq("status", "processing").eq("updated_at", current.updated_at)
        .select("id,mime_type,storage_path,size_bytes,status,updated_at").maybeSingle();
      if (reclaimError) throw reclaimError;
      if (reclaimed) return reclaimed;
    }
    return {conflict: "processing" as const};
  }
  return {conflict: "other" as const};
}

export async function POST(_request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.", 400);
  const db = serverSupabase();

  let reserved;
  try {
    reserved = await claimForProcessing(db, id);
  } catch {
    return jsonError("Could not start processing.", 500);
  }
  if (!reserved) return jsonError("Document missing, already ready, or being processed.", 409);
  if ("conflict" in reserved) {
    if (reserved.conflict === "ready") return jsonError("Document is already ready.", 409);
    if (reserved.conflict === "processing") {
      return jsonError("Document is already being processed. Retry shortly if it stays stuck.", 409);
    }
    return jsonError("Document missing, already ready, or being processed.", 409);
  }

  try {
    const {data: file, error: downloadError} = await db.storage.from(storageBucket()).download(reserved.storage_path);
    if (downloadError || !file) throw new Error("Uploaded file was not found in storage. Re-upload the document.");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length !== reserved.size_bytes) {
      throw new Error("File size differs from the declared upload size.");
    }
    if (![DOCUMENT_TYPES.pdf, DOCUMENT_TYPES.docx].includes(reserved.mime_type as AllowedDocumentType)) {
      throw new Error("Unsupported file type.");
    }
    const extracted = await extractDocument(buffer, reserved.mime_type as AllowedDocumentType);
    const source = createCanonicalSource(extracted.pages);
    const pageRows = extracted.pages.map(page => {
      const bounds = source.pages.find(p => p.pageIndex === page.pageIndex)!;
      return {document_id: id, page_index: page.pageIndex, content: page.text, start_offset: bounds.start, end_offset: bounds.end};
    });
    const chunkRows = createChunks(source.text).map(chunk => ({
      document_id: id, chunk_index: chunk.chunkIndex, start_offset: chunk.startOffset,
      end_offset: chunk.endOffset, content: chunk.content
    }));

    // Idempotent replacement: purge derived rows, then insert. Not a single cross-table transaction.
    const {error: purgePagesError} = await db.from("document_pages").delete().eq("document_id", id);
    const {error: purgeChunksError} = await db.from("document_chunks").delete().eq("document_id", id);
    if (purgePagesError || purgeChunksError) throw purgePagesError ?? purgeChunksError;

    for (let i = 0; i < pageRows.length; i += 100) {
      const {error} = await db.from("document_pages").insert(pageRows.slice(i, i + 100));
      if (error) throw error;
    }
    for (let i = 0; i < chunkRows.length; i += 100) {
      const {error} = await db.from("document_chunks").insert(chunkRows.slice(i, i + 100));
      if (error) throw error;
    }

    const {data: finalized, error: finalError} = await db.from("documents").update({
      status: "ready", page_count: extracted.pageCount, unreadable_page_count: extracted.unreadablePageCount,
      char_count: source.text.length, error_code: null, error_message: null, updated_at: new Date().toISOString()
    }).eq("id", id).eq("status", "processing").select("id").maybeSingle();
    if (finalError) throw finalError;
    if (!finalized) {
      // Deleted or lease lost during processing — drop derived rows to avoid orphans.
      await db.from("document_pages").delete().eq("document_id", id);
      await db.from("document_chunks").delete().eq("document_id", id);
      return jsonError("Document was changed or deleted during processing.", 409);
    }
    return NextResponse.json({
      documentId: id, status: "ready", pageCount: extracted.pageCount,
      unreadablePages: extracted.unreadablePageCount, charCount: source.text.length
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown parsing failure";
    const failure = publicFailure(message);
    await db.from("documents").update({
      status: "failed",
      error_code: failure.code,
      error_message: failure.message,
      updated_at: new Date().toISOString()
    }).eq("id", id).eq("status", "processing");
    // Best-effort: do not leave partial ready-looking derived text on failed jobs.
    await db.from("document_pages").delete().eq("document_id", id);
    await db.from("document_chunks").delete().eq("document_id", id);
    return jsonError(failure.message, 422);
  }
}
