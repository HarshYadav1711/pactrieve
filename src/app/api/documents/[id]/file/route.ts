import {NextResponse} from "next/server";
import {isUuid, jsonError} from "@/lib/http";
import {serverSupabase, storageBucket} from "@/lib/supabase/server";

export const runtime = "nodejs";
type RouteContext = {params: Promise<{id: string}>};
export async function GET(request: Request, {params}: RouteContext) {
  const {id} = await params;
  if (!isUuid(id)) return jsonError("Invalid document ID.",400);
  try {
    const db = serverSupabase();
    const {data: doc} = await db.from("documents").select("storage_path")
      .eq("id",id).maybeSingle();
    if (!doc) return jsonError("Document not found.",404);
    const {data,error} = await db.storage.from(storageBucket()).createSignedUrl(doc.storage_path,300);
    if (error || !data) throw error;
    if (new URL(request.url).searchParams.get("redirect") === "1") {
      const response = NextResponse.redirect(data.signedUrl, 302);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    return NextResponse.json({url:data.signedUrl}, {headers: {"Cache-Control": "no-store"}});
  } catch { return jsonError("Could not open original file.",500); }
}
