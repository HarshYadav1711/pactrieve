import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {buildDocxPreview} from "@/lib/docx";
import {DOCUMENT_TYPES} from "@/lib/documents/validate";
import {serverSupabase, storageBucket} from "@/lib/supabase/server";

export const runtime = "nodejs";
type RouteContext = {params: Promise<{id: string}>};

/**
 * Returns a React-safe semantic DOCX preview AST for the original uploaded file.
 * Does not alter stored canonical extraction.
 */
export async function GET(_request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.", 400);
  try {
    const db = serverSupabase();
    const {data: doc, error} = await db
      .from("documents")
      .select("id,name,mime_type,status,storage_path")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return jsonError("Document not found.", 404);
    if (doc.status !== "ready") return jsonError("Document is not ready for analysis.", 409);
    if (doc.mime_type !== DOCUMENT_TYPES.docx) {
      return jsonError("DOCX preview is only available for Word documents.", 415);
    }

    const {data: blob, error: downloadError} = await db.storage.from(storageBucket()).download(doc.storage_path);
    if (downloadError || !blob) throw downloadError ?? new Error("download failed");
    const buffer = Buffer.from(await blob.arrayBuffer());
    const preview = await buildDocxPreview(buffer);

    return NextResponse.json(
      {
        documentId: doc.id,
        name: doc.name,
        blocks: preview.blocks,
        renderText: preview.renderText,
        canonicalApprox: preview.canonicalApprox,
        leaves: preview.leaves,
        warnings: preview.warnings.slice(0, 20)
      },
      {headers: {"Cache-Control": "private, no-store"}}
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to build DOCX preview.";
    console.error("docx-preview failed:", message);
    return jsonError("Unable to build DOCX preview.", 500);
  }
}
