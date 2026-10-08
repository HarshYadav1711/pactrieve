import {NextResponse} from "next/server";
import {serverSupabase, storageBucket} from "@/lib/supabase/server";
import {jsonError} from "@/lib/http";

export const runtime = "nodejs";
export async function GET() {
  try {
    const db = serverSupabase();
    const {data, error} = await db.from("documents")
      .select("id,name,mime_type,size_bytes,status,error_code,error_message,page_count,unreadable_page_count,created_at")
      .order("created_at", {ascending: false});
    if (error) throw error;
    return NextResponse.json({documents: data ?? []}, {headers: {"Cache-Control": "no-store"}});
  } catch {
    return jsonError("Could not load documents. Check database configuration.", 500);
  }
}
