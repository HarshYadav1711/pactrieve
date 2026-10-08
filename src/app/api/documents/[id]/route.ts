import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {serverSupabase, storageBucket} from "@/lib/supabase/server";

export const runtime = "nodejs";
type RouteContext = {params: Promise<{id: string}>};
export async function DELETE(_request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.", 400);
  try {
    const db = serverSupabase();
    const {data: doc, error: lookupError} = await db.from("documents")
      .select("storage_path").eq("id",id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!doc) return jsonError("Document not found.",404);
    const {error: storageError} = await db.storage.from(storageBucket()).remove([doc.storage_path]);
    if (storageError) throw storageError;
    const {error} = await db.from("documents").delete().eq("id",id);
    if (error) throw error;
    return NextResponse.json({deleted: true});
  } catch { return jsonError("Could not delete document; retry later.",500); }
}
