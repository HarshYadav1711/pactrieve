import type {DocumentChunk} from "../documents/chunks.ts";
import {detectSections, sectionLabelForRange} from "../documents/chunks.ts";
import type {PageBoundary} from "../evidence/verify.ts";
import {expandPassages} from "./expand.ts";
import {pageIndicesForRange} from "./pages.ts";
import {extractExactPhrases, ftsTerms, looksLikeExistenceQuestion, normalizeQuery} from "./query.ts";
import type {MatchKind, RetrievedPassage, RetrievalCoverage, RetrievalMode, RetrievalResult} from "./types.ts";

export interface MemoryDocument {
  documentId: string;
  text: string;
  pages: PageBoundary[];
  chunks: DocumentChunk[];
  unreadablePageCount?: number;
  pageCount?: number | null;
}

function scoreLiteral(content: string, phrase: string): number {
  const hay = content.toLowerCase();
  const needle = phrase.toLowerCase();
  if (!needle) return 0;
  let score = 0;
  let from = 0;
  while (from <= hay.length) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) break;
    score += 10 + Math.min(5, needle.length / 10);
    from = idx + Math.max(1, needle.length);
  }
  return score;
}

function scoreTerms(content: string, terms: string[]): number {
  const hay = content.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (hay.includes(term)) score += 2;
  }
  return score;
}

function scoreSection(label: string | null, query: string): number {
  if (!label) return 0;
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l.includes(q) || q.includes(l.slice(0, Math.min(40, l.length)))) return 8;
  const sectionHit = q.match(/\b(?:section|clause|article)\s+(\d+(?:\.\d+)*)\b/i);
  if (sectionHit && l.startsWith(sectionHit[1])) return 12;
  return 0;
}

export function searchMemoryDocument(
  doc: MemoryDocument,
  query: string,
  options: {
    limit?: number;
    mode?: RetrievalMode;
    expand?: boolean;
    maxExpandedChars?: number;
  } = {}
): RetrievalResult {
  const normalized = normalizeQuery(query);
  const limit = options.limit ?? 8;
  const mode: RetrievalMode = options.mode ?? (looksLikeExistenceQuestion(normalized) ? "existence" : "ranked");
  const expand = options.expand ?? true;
  const maxExpandedChars = options.maxExpandedChars ?? 4500;
  const sections = detectSections(doc.text);
  const phrases = extractExactPhrases(normalized);
  const terms = ftsTerms(normalized);
  const existenceLimit = Math.min(Math.max(limit * 4, 24), Math.max(doc.chunks.length, 1));
  const candidateCap = mode === "existence" ? existenceLimit : Math.min(Math.max(limit * 3, limit), doc.chunks.length);

  const notes: string[] = [];
  const unreadable = doc.unreadablePageCount ?? 0;
  if (unreadable > 0) {
    notes.push(`${unreadable} page(s) yielded no extractable text; absence claims over those areas are unreliable.`);
  }

  if (!normalized) {
    return {
      documentId: doc.documentId,
      query: normalized,
      passages: [],
      coverage: {
        status: "SEARCH_FAILED",
        searchablePageCount: doc.pageCount ?? doc.pages.length,
        unreadablePageCount: unreadable,
        searchedChunkCount: 0,
        totalChunkCount: doc.chunks.length,
        mode,
        notes: ["Query was empty."]
      }
    };
  }

  const amountPhrases = phrases.filter(phrase => /\b(?:AED|USD|EUR|GBP|INR)\s*\d/i.test(phrase));
  const scored: RetrievedPassage[] = [];
  let anyPhraseHit = false;
  for (const chunk of doc.chunks) {
    let phraseScore = 0;
    let amountHit = false;
    let matchKind: MatchKind = "fts";
    for (const phrase of phrases) {
      const hit = scoreLiteral(chunk.content, phrase);
      if (hit > 0) {
        phraseScore += hit;
        matchKind = phrase.length >= Math.min(normalized.length, 24) * 0.5 ? "phrase" : "literal";
        if (amountPhrases.includes(phrase)) amountHit = true;
      }
    }
    // Amount queries must not retrieve near-miss figures via token overlap (100 vs 1,000,000).
    if (amountPhrases.length && !amountHit) continue;
    if (phraseScore > 0) anyPhraseHit = true;
    // Term overlap is a weak signal; do not let filler tokens outrank exact legal phrases.
    const termScore = scoreTerms(chunk.content, terms) * (phraseScore > 0 ? 1 : 0.25);
    const sectionBoost = scoreSection(
      chunk.sectionLabel ?? sectionLabelForRange(sections, chunk.startOffset, chunk.endOffset),
      normalized
    );
    if (sectionBoost && matchKind === "fts") matchKind = "section";
    const score = phraseScore * 5 + termScore + sectionBoost;
    if (score <= 0) continue;
    scored.push({
      documentId: doc.documentId,
      chunkId: null,
      chunkIndex: chunk.chunkIndex,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      pageIndices: pageIndicesForRange(doc.pages, chunk.startOffset, chunk.endOffset),
      sectionLabel: chunk.sectionLabel ?? sectionLabelForRange(sections, chunk.startOffset, chunk.endOffset),
      content: chunk.content,
      score,
      matchKind
    });
  }

  // When the query contains distinctive phrases/amounts, keep phrase-confirming hits first.
  scored.sort((a, b) => {
    if (anyPhraseHit) {
      const aPhrase = a.matchKind === "phrase" || a.matchKind === "literal" ? 1 : 0;
      const bPhrase = b.matchKind === "phrase" || b.matchKind === "literal" ? 1 : 0;
      if (aPhrase !== bPhrase) return bPhrase - aPhrase;
    }
    return b.score - a.score || a.startOffset - b.startOffset;
  });
  const top = scored.slice(0, candidateCap);
  let passages = top.slice(0, limit);
  if (expand && passages.length) {
    passages = expandPassages(doc.documentId, doc.text, doc.chunks, passages, {maxExpandedChars});
    passages = passages.map(passage => ({
      ...passage,
      pageIndices: pageIndicesForRange(doc.pages, passage.startOffset, passage.endOffset),
      sectionLabel: passage.sectionLabel ?? sectionLabelForRange(sections, passage.startOffset, passage.endOffset)
    }));
  }

  let status: RetrievalCoverage["status"] = passages.length ? "MATCHES_FOUND" : "NO_MATCH_ESTABLISHED";
  if (!passages.length && mode === "ranked") {
    status = "SEARCH_LIMITED";
    notes.push("Ranked lexical search returned no match among considered chunks; this does not prove the provision is absent.");
  } else if (!passages.length && mode === "existence") {
    status = "NO_MATCH_ESTABLISHED";
    notes.push("Broader lexical/existence search found no matching wording; semantically equivalent clauses may still exist.");
  }
  if (unreadable > 0 && status !== "MATCHES_FOUND") status = "PARTIAL_SOURCE";
  if (mode === "ranked" && passages.length && candidateCap < doc.chunks.length) {
    notes.push(`Ranked mode inspected up to ${candidateCap} candidate chunk(s) of ${doc.chunks.length}; use existence mode for broader coverage.`);
  }

  return {
    documentId: doc.documentId,
    query: normalized,
    passages,
    coverage: {
      status,
      searchablePageCount: doc.pageCount ?? doc.pages.filter(p => p.end > p.start).length,
      unreadablePageCount: unreadable,
      searchedChunkCount: Math.min(candidateCap, doc.chunks.length),
      totalChunkCount: doc.chunks.length,
      mode,
      notes
    }
  };
}
