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
    const {data: doc} = await db
      .from("documents")
      .select("storage_path,mime_type,name")
      .eq("id", id)
      .maybeSingle();
    if (!doc) return jsonError("Document not found.",404);

    const url = new URL(request.url);
    // Same-origin binary stream for the in-app PDF viewer (avoids exposing
    // long-lived public URLs and sidesteps signed-URL CORS issues).
    if (url.searchParams.get("raw") === "1") {
      const {data: blob, error: downloadError} = await db.storage
        .from(storageBucket())
        .download(doc.storage_path);
      if (downloadError || !blob) throw downloadError;
      const buffer = Buffer.from(await blob.arrayBuffer());
      const contentType = doc.mime_type || "application/pdf";
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(buffer.byteLength),
          "Cache-Control": "private, no-store",
          "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name || "document")}"`,
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    const {data,error} = await db.storage.from(storageBucket()).createSignedUrl(doc.storage_path,300);
    if (error || !data) throw error;
    if (url.searchParams.get("redirect") === "1") {
      const response = NextResponse.redirect(data.signedUrl, 302);
      response.headers.set("Cache-Control", "no-store");
      return response;
    }
    return NextResponse.json({url:data.signedUrl}, {headers: {"Cache-Control": "no-store"}});
  } catch { return jsonError("Could not open original file.",500); }
}
