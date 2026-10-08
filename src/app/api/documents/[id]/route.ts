import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {serverSupabase, storageBucket} from "@/lib/supabase/server";

export const runtime = "nodejs";
type RouteContext = {params: Promise<{id: string}>};

function isMissingObject(error: {message?: string; status?: number; statusCode?: string} | null | undefined) {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  return message.includes("not found") || message.includes("object not found") ||
    error.status === 404 || error.statusCode === "404" || error.statusCode === "not_found";
}

export async function DELETE(_request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.", 400);
  try {
    const db = serverSupabase();
    const {data: doc, error: lookupError} = await db.from("documents")
      .select("storage_path").eq("id", id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!doc) return jsonError("Document not found.", 404);

    const {error: storageError} = await db.storage.from(storageBucket()).remove([doc.storage_path]);
    if (storageError && !isMissingObject(storageError)) {
      return jsonError("Could not delete the stored original file. The library entry was left unchanged.", 500);
    }

    const {error: deleteError} = await db.from("documents").delete().eq("id", id);
    if (deleteError) {
      // Storage object may already be gone; do not claim full success.
      return jsonError("Stored file was removed, but the database record could not be deleted. Retry delete shortly.", 500);
    }
    return NextResponse.json({deleted: true});
  } catch {
    return jsonError("Could not delete document; retry later.", 500);
  }
}
