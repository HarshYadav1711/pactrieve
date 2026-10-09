import {verifyQuote, type CanonicalSource} from "../evidence/verify.ts";
import type {EvidenceItem, VerifiedCitation} from "./types.ts";
import {getEvidenceById} from "./evidence.ts";

/**
 * Extract evidence ID references from model output.
 *
 * Recognized forms (id must be `e` + digits only):
 * - Canonical ASCII: [e1]
 * - Parentheses: (e1)
 * - CJK corner brackets observed from Groq gpt-oss: 【e1】
 * - Bare e12 after whitespace/punctuation (conservative)
 *
 * Does not accept arbitrary bracketed text, page numbers, or invented labels.
 */
const EVIDENCE_ID_RE =
  /\[(e\d+)\]|\u3010(e\d+)\u3011|\((e\d+)\)|(?:^|[\s,;:])(e\d+)(?=[\s,.;:!?\u3011\]]|$)/gi;

/**
 * Collect unique evidence IDs referenced in model output.
 * Does not trust any other citation format (pages, offsets, invented labels).
 */
export function extractReferencedEvidenceIds(answerText: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(EVIDENCE_ID_RE.source, EVIDENCE_ID_RE.flags);
  while ((match = re.exec(answerText))) {
    const id = (match[1] || match[2] || match[3] || match[4] || "").toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    found.push(id);
  }
  return found;
}

export interface CitationResolution {
  citations: VerifiedCitation[];
  /** IDs the model mentioned that are not in the registry (or fail re-verification). */
  rejectedEvidenceIds: string[];
  /** True when the model attempted to cite something we cannot verify. */
  hasUnsupportedCitations: boolean;
}

/**
 * Resolve model-mentioned evidence IDs against the prepared registry and re-verify quotes.
 * Server-derived positions only. Invented IDs are rejected.
 */
export function resolveCitations(
  documentId: string,
  source: CanonicalSource,
  registry: EvidenceItem[],
  answerText: string
): CitationResolution {
  const referenced = extractReferencedEvidenceIds(answerText);
  const citations: VerifiedCitation[] = [];
  const rejectedEvidenceIds: string[] = [];
  const cited = new Set<string>();

  for (const id of referenced) {
    const item = getEvidenceById(registry, id);
    if (!item) {
      rejectedEvidenceIds.push(id);
      continue;
    }
    if (item.documentId !== documentId) {
      rejectedEvidenceIds.push(id);
      continue;
    }
    const recheck = verifyQuote(source, item.quote);
    if (!recheck.verified || !recheck.occurrences.length) {
      rejectedEvidenceIds.push(id);
      continue;
    }
    // Prefer the occurrence matching the registry offsets.
    const occ =
      recheck.occurrences.find(o => o.start === item.startOffset && o.end === item.endOffset) ??
      recheck.occurrences[0];
    if (cited.has(id)) continue;
    cited.add(id);
    citations.push({
      evidenceId: id,
      documentId,
      quote: occ.exactSourceText,
      startOffset: occ.start,
      endOffset: occ.end,
      pageIndices: occ.pageIndices,
      sectionLabel: item.sectionLabel,
      occurrenceIndex: occ.occurrenceIndex,
      verified: true
    });
  }

  return {
    citations,
    rejectedEvidenceIds,
    hasUnsupportedCitations: rejectedEvidenceIds.length > 0
  };
}

/**
 * When the model answers without ID markers but literally quotes evidence, attach those.
 * Conservative: we do NOT auto-attach all evidence.
 */
export function findLiteralQuotedEvidence(
  documentId: string,
  source: CanonicalSource,
  registry: EvidenceItem[],
  answerText: string
): VerifiedCitation[] {
  const out: VerifiedCitation[] = [];
  for (const item of registry) {
    if (item.documentId !== documentId) continue;
    const needle = item.quote.length <= 80 ? item.quote : item.quote.slice(0, 80);
    if (!answerText.includes(needle.trim()) && !normalizeWs(answerText).includes(normalizeWs(needle))) {
      continue;
    }
    const recheck = verifyQuote(source, item.quote);
    if (!recheck.verified || !recheck.occurrences.length) continue;
    const occ =
      recheck.occurrences.find(o => o.start === item.startOffset && o.end === item.endOffset) ??
      recheck.occurrences[0];
    out.push({
      evidenceId: item.id,
      documentId,
      quote: occ.exactSourceText,
      startOffset: occ.start,
      endOffset: occ.end,
      pageIndices: occ.pageIndices,
      sectionLabel: item.sectionLabel,
      occurrenceIndex: occ.occurrenceIndex,
      verified: true
    });
  }
  return out;
}

/**
 * Resolve citations for a multi-document registry.
 * Each evidence ID verifies ONLY against its own document's canonical source —
 * never against sibling selected documents, even when quote text is identical.
 */
export function resolveCitationsMulti(
  sourcesByDocumentId: ReadonlyMap<string, CanonicalSource>,
  registry: EvidenceItem[],
  answerText: string
): CitationResolution {
  const referenced = extractReferencedEvidenceIds(answerText);
  const citations: VerifiedCitation[] = [];
  const rejectedEvidenceIds: string[] = [];
  const cited = new Set<string>();

  for (const id of referenced) {
    const item = getEvidenceById(registry, id);
    if (!item) {
      rejectedEvidenceIds.push(id);
      continue;
    }
    const source = sourcesByDocumentId.get(item.documentId);
    if (!source) {
      rejectedEvidenceIds.push(id);
      continue;
    }
    const recheck = verifyQuote(source, item.quote);
    if (!recheck.verified || !recheck.occurrences.length) {
      rejectedEvidenceIds.push(id);
      continue;
    }
    const occ =
      recheck.occurrences.find(o => o.start === item.startOffset && o.end === item.endOffset) ??
      recheck.occurrences[0];
    if (cited.has(id)) continue;
    cited.add(id);
    citations.push({
      evidenceId: id,
      documentId: item.documentId,
      quote: occ.exactSourceText,
      startOffset: occ.start,
      endOffset: occ.end,
      pageIndices: occ.pageIndices,
      sectionLabel: item.sectionLabel,
      occurrenceIndex: occ.occurrenceIndex,
      verified: true
    });
  }

  return {
    citations,
    rejectedEvidenceIds,
    hasUnsupportedCitations: rejectedEvidenceIds.length > 0
  };
}

/** Literal-quote fallback scoped per evidence item's own document. */
export function findLiteralQuotedEvidenceMulti(
  sourcesByDocumentId: ReadonlyMap<string, CanonicalSource>,
  registry: EvidenceItem[],
  answerText: string
): VerifiedCitation[] {
  const out: VerifiedCitation[] = [];
  for (const item of registry) {
    const source = sourcesByDocumentId.get(item.documentId);
    if (!source) continue;
    const needle = item.quote.length <= 80 ? item.quote : item.quote.slice(0, 80);
    if (!answerText.includes(needle.trim()) && !normalizeWs(answerText).includes(normalizeWs(needle))) {
      continue;
    }
    const recheck = verifyQuote(source, item.quote);
    if (!recheck.verified || !recheck.occurrences.length) continue;
    const occ =
      recheck.occurrences.find(o => o.start === item.startOffset && o.end === item.endOffset) ??
      recheck.occurrences[0];
    out.push({
      evidenceId: item.id,
      documentId: item.documentId,
      quote: occ.exactSourceText,
      startOffset: occ.start,
      endOffset: occ.end,
      pageIndices: occ.pageIndices,
      sectionLabel: item.sectionLabel,
      occurrenceIndex: occ.occurrenceIndex,
      verified: true
    });
  }
  return out;
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
