import {createCanonicalSource} from "@/lib/evidence/verify";
import {serverSupabase} from "@/lib/supabase/server";

export async function getDocumentSource(documentId: string) {
  const db = serverSupabase();
  const {data: document, error: docError} = await db.from("documents")
    .select("id,name,status,mime_type,page_count,unreadable_page_count,created_at")
    .eq("id", documentId).single();
  if (docError || !document) return null;
  const {data: pages, error: pagesError} = await db.from("document_pages")
    .select("page_index,content").eq("document_id", documentId)
    .order("page_index", {ascending: true});
  if (pagesError) throw pagesError;
  const source = createCanonicalSource((pages ?? []).map(p => ({pageIndex: p.page_index, text: p.content})));
  return {document, source};
}
