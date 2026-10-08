import {createChunks, detectSections, sectionLabelForRange, type DocumentChunk} from "../documents/chunks.ts";
import {createCanonicalSource, type PageBoundary} from "../evidence/verify.ts";
import {serverSupabase} from "../supabase/server.ts";
import {searchMemoryDocument, type MemoryDocument} from "./memory.ts";
import {extractExactPhrases, ftsTerms, looksLikeExistenceQuestion, normalizeQuery} from "./query.ts";
import {retrievalRequestSchema, type RetrievalRequest, type RetrievalResult} from "./types.ts";

async function loadMemoryDocument(documentId: string): Promise<MemoryDocument | null> {
  const db = serverSupabase();
  const {data: document, error: docError} = await db.from("documents")
    .select("id,status,page_count,unreadable_page_count,char_count")
    .eq("id", documentId).maybeSingle();
  if (docError) throw docError;
  if (!document) return null;
  if (document.status !== "ready") {
    return {
      documentId,
      text: "",
      pages: [],
      chunks: [],
      unreadablePageCount: document.unreadable_page_count ?? 0,
      pageCount: document.page_count
    };
  }

  const {data: pages, error: pagesError} = await db.from("document_pages")
    .select("page_index,content,start_offset,end_offset")
    .eq("document_id", documentId)
    .order("page_index", {ascending: true});
  if (pagesError) throw pagesError;

  const source = createCanonicalSource((pages ?? []).map(p => ({pageIndex: p.page_index, text: p.content})));
  const pageBounds: PageBoundary[] = source.pages;

  const {data: chunkRows, error: chunkError} = await db.from("document_chunks")
    .select("id,chunk_index,start_offset,end_offset,content")
    .eq("document_id", documentId)
    .order("chunk_index", {ascending: true});
  if (chunkError) throw chunkError;

  let chunks: DocumentChunk[] = (chunkRows ?? []).map(row => ({
    chunkIndex: row.chunk_index,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    content: row.content,
    sectionLabel: null
  }));

  // If offsets drift or chunks missing, rebuild in memory from canonical text (does not mutate DB).
  if (!chunks.length || chunks.some(c => source.text.slice(c.startOffset, c.endOffset) !== c.content)) {
    chunks = createChunks(source.text);
  } else {
    const sections = detectSections(source.text);
    chunks = chunks.map(chunk => ({
      ...chunk,
      sectionLabel: sectionLabelForRange(sections, chunk.startOffset, chunk.endOffset)
    }));
  }

  return {
    documentId,
    text: source.text,
    pages: pageBounds,
    chunks,
    unreadablePageCount: document.unreadable_page_count ?? 0,
    pageCount: document.page_count
  };
}

/**
 * Reindex derived chunks for a ready document using the current structure-aware chunker.
 * Preserves document/pages rows; replaces chunk rows only.
 */
export async function reindexDocumentChunks(documentId: string): Promise<{chunkCount: number}> {
  const db = serverSupabase();
  const {data: document, error: docError} = await db.from("documents")
    .select("id,status").eq("id", documentId).maybeSingle();
  if (docError) throw docError;
  if (!document || document.status !== "ready") throw new Error("Document is not ready for reindexing.");

  const {data: pages, error: pagesError} = await db.from("document_pages")
    .select("page_index,content")
    .eq("document_id", documentId)
    .order("page_index", {ascending: true});
  if (pagesError) throw pagesError;
  const source = createCanonicalSource((pages ?? []).map(p => ({pageIndex: p.page_index, text: p.content})));
  const chunks = createChunks(source.text);
  const {error: purgeError} = await db.from("document_chunks").delete().eq("document_id", documentId);
  if (purgeError) throw purgeError;
  const rows = chunks.map(chunk => ({
    document_id: documentId,
    chunk_index: chunk.chunkIndex,
    start_offset: chunk.startOffset,
    end_offset: chunk.endOffset,
    content: chunk.content
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const {error} = await db.from("document_chunks").insert(rows.slice(i, i + 100));
    if (error) throw error;
  }
  return {chunkCount: rows.length};
}

async function searchViaPostgresFts(
  documentId: string,
  query: string,
  limit: number
): Promise<{chunk_index: number; content: string; start_offset: number; end_offset: number; id: number; rank: number}[]> {
  const db = serverSupabase();
  const terms = ftsTerms(query);
  if (!terms.length) return [];
  // plainto_tsquery with simple config avoids English stemming of legal terms.
  const tsQuery = terms.join(" & ");
  const {data, error} = await db.rpc("pactrieve_search_chunks", {
    p_document_id: documentId,
    p_tsquery: tsQuery,
    p_limit: limit
  });
  if (error) {
    // Function may be absent before optional SQL helper is applied — fall back to client filter.
    const {data: rows, error: listError} = await db.from("document_chunks")
      .select("id,chunk_index,start_offset,end_offset,content")
      .eq("document_id", documentId)
      .limit(5000);
    if (listError) throw listError;
    return (rows ?? [])
      .map(row => {
        const hay = row.content.toLowerCase();
        const rank = terms.reduce((sum, term) => sum + (hay.includes(term) ? 1 : 0), 0);
        return {...row, rank};
      })
      .filter(row => row.rank > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit)
      .map(row => ({
        chunk_index: row.chunk_index,
        content: row.content,
        start_offset: row.start_offset,
        end_offset: row.end_offset,
        id: row.id,
        rank: row.rank
      }));
  }
  return (data ?? []) as {chunk_index: number; content: string; start_offset: number; end_offset: number; id: number; rank: number}[];
}

export async function retrieveFromSupabase(input: RetrievalRequest): Promise<RetrievalResult> {
  const parsed = retrievalRequestSchema.parse(input);
  const normalized = normalizeQuery(parsed.query);
  const doc = await loadMemoryDocument(parsed.documentId);
  if (!doc) {
    return {
      documentId: parsed.documentId,
      query: normalized,
      passages: [],
      coverage: {
        status: "DOCUMENT_UNAVAILABLE",
        searchablePageCount: null,
        unreadablePageCount: 0,
        searchedChunkCount: 0,
        totalChunkCount: 0,
        mode: parsed.mode,
        notes: ["Document was not found."]
      }
    };
  }
  if (!doc.text) {
    return {
      documentId: parsed.documentId,
      query: normalized,
      passages: [],
      coverage: {
        status: "DOCUMENT_UNAVAILABLE",
        searchablePageCount: doc.pageCount ?? null,
        unreadablePageCount: doc.unreadablePageCount ?? 0,
        searchedChunkCount: 0,
        totalChunkCount: 0,
        mode: parsed.mode,
        notes: ["Document is not ready for retrieval."]
      }
    };
  }

  // Deterministic lexical scoring over Postgres-persisted chunks (same rules as unit tests).
  // Optional SQL FTS/ILIKE only discovers extra candidate indexes; final ranking stays phrase-safe.
  const mode = parsed.mode ?? (looksLikeExistenceQuestion(normalized) ? "existence" : "ranked");
  const notes: string[] = [];
  try {
    const ftsLimit = mode === "existence" ? Math.min(40, Math.max(parsed.limit * 4, 24)) : Math.min(24, parsed.limit * 3);
    const ftsHits = await searchViaPostgresFts(parsed.documentId, normalized, ftsLimit);
    const db = serverSupabase();
    const discovered = new Map<number, number>();
    for (const hit of ftsHits) discovered.set(hit.chunk_index, hit.id);
    for (const phrase of extractExactPhrases(normalized).slice(0, 6)) {
      const {data: phraseRows} = await db.from("document_chunks")
        .select("id,chunk_index")
        .eq("document_id", parsed.documentId)
        .ilike("content", `%${phrase.replace(/[%_]/g, "\\$&")}%`)
        .limit(20);
      for (const row of phraseRows ?? []) discovered.set(row.chunk_index, row.id);
    }
    notes.push(
      discovered.size
        ? `PostgreSQL FTS/ILIKE discovered ${discovered.size} candidate chunk(s); ranked with phrase-safe scorer.`
        : "PostgreSQL FTS/ILIKE returned no extra candidates; ranked persisted chunks with phrase-safe scorer."
    );
  } catch (error) {
    notes.push(
      `PostgreSQL FTS helper unavailable (${error instanceof Error ? error.message : "unknown"}); scored persisted chunks locally.`
    );
  }

  const ranked = searchMemoryDocument(doc, normalized, {
    limit: parsed.limit,
    mode,
    expand: parsed.expand,
    maxExpandedChars: parsed.maxExpandedChars
  });
  ranked.coverage.notes = [...ranked.coverage.notes, ...notes];
  return ranked;
}

export async function retrieveDocument(input: RetrievalRequest): Promise<RetrievalResult> {
  return retrieveFromSupabase(input);
}
