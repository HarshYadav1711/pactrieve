import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {serverSupabase, storageBucket} from "@/lib/supabase/server";
import {extractDocument} from "@/lib/documents/extract";
import {createCanonicalSource} from "@/lib/evidence/verify";
import {createChunks} from "@/lib/documents/chunks";
import {DOCUMENT_TYPES, type AllowedDocumentType} from "@/lib/documents/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {params: Promise<{id: string}>};
export async function POST(_request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.", 400);
  const db = serverSupabase();
  const {data: reserved, error: reserveError} = await db.from("documents")
    .update({status: "processing", error_code: null, error_message: null, updated_at: new Date().toISOString()})
    .eq("id", id).in("status", ["uploading", "failed"])
    .select("id,mime_type,storage_path,size_bytes").maybeSingle();
  if (reserveError) return jsonError("Could not start processing.", 500);
  if (!reserved) return jsonError("Document missing, already ready, or being processed.", 409);

  try {
    const {data: file, error: downloadError} = await db.storage.from(storageBucket()).download(reserved.storage_path);
    if (downloadError || !file) throw new Error("Uploaded file was not found in storage.");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length !== reserved.size_bytes) throw new Error("File size differs from the declared upload size.");
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
    const {error: finalError} = await db.from("documents").update({
      status: "ready", page_count: extracted.pageCount, unreadable_page_count: extracted.unreadablePageCount,
      char_count: source.text.length, updated_at: new Date().toISOString()
    }).eq("id", id);
    if (finalError) throw finalError;
    return NextResponse.json({documentId: id, status: "ready", pageCount: extracted.pageCount,
      unreadablePages: extracted.unreadablePageCount, charCount: source.text.length});
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown parsing failure";
    const isUnreadable = message.includes("no readable text") || message.includes("No readable text") || message.includes("scanned/image-only");
    const safeMessage = isUnreadable ? "No readable text was extracted. Scanned PDFs require OCR, which is not supported yet." :
      "We could not process this file. It may be malformed, encrypted, or unsupported.";
    await db.from("documents").update({status: "failed", error_code: isUnreadable ? "NO_READABLE_TEXT" : "EXTRACTION_FAILED",
      error_message: safeMessage, updated_at: new Date().toISOString()}).eq("id", id);
    return jsonError(safeMessage, 422);
  }
}
