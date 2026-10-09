import {verifyQuote, type CanonicalSource} from "../evidence/verify.ts";
import type {RetrievedPassage, RetrievalResult} from "../retrieval/types.ts";
import type {EvidenceItem} from "./types.ts";

/** Soft upper bound on characters of evidence text placed in the LLM prompt. */
export const DEFAULT_EVIDENCE_CHAR_BUDGET = 6_000;

/** Aggregate budget when comparing multiple documents (Phase 7). */
export const MULTI_DOC_EVIDENCE_CHAR_BUDGET = 8_000;

export interface PreparedEvidence {
  items: EvidenceItem[];
  /** True when some retrieved passages were dropped to fit the char budget. */
  truncated: boolean;
  /** Passages that failed deterministic verification (should be rare if offsets are sound). */
  rejectedPassages: number;
}

/**
 * Build a verified evidence registry from retrieved passages.
 * Every registry entry is independently confirmed against canonical source text.
 * Evidence IDs are stable for this request only (e1, e2, …).
 */
export function prepareEvidenceRegistry(
  documentId: string,
  source: CanonicalSource,
  retrieval: RetrievalResult,
  options: {charBudget?: number} = {}
): PreparedEvidence {
  const budget = options.charBudget ?? DEFAULT_EVIDENCE_CHAR_BUDGET;
  const items: EvidenceItem[] = [];
  let used = 0;
  let truncated = false;
  let rejectedPassages = 0;

  // Retrieval may return passages in document order after expansion. Prefer higher-scoring
  // (and phrase/literal) hits when filling the prompt budget so late-clause evidence is kept.
  const ranked = [...retrieval.passages].sort((a, b) => {
    const rank = (kind: string) =>
      kind === "phrase" ? 3 : kind === "literal" ? 2 : kind === "section" ? 1 : kind === "expanded" ? 0 : 0;
    const kindDelta = rank(b.matchKind) - rank(a.matchKind);
    if (kindDelta !== 0) return kindDelta;
    return b.score - a.score || a.startOffset - b.startOffset;
  });

  for (const passage of ranked) {
    if (passage.documentId !== documentId) {
      rejectedPassages++;
      continue;
    }
    const candidate = selectPassageQuote(passage, source);
    if (!candidate) {
      rejectedPassages++;
      continue;
    }
    if (used + candidate.quote.length > budget && items.length > 0) {
      truncated = true;
      break;
    }
    // Always include at least one passage even if over budget (bounded by passage size).
    if (used + candidate.quote.length > budget && items.length === 0 && candidate.quote.length > budget) {
      // Trim to budget on whitespace boundary while re-verifying.
      const trimmed = trimToBudget(candidate.quote, budget);
      const recheck = verifyQuote(source, trimmed);
      if (!recheck.verified || !recheck.occurrences.length) {
        rejectedPassages++;
        truncated = true;
        continue;
      }
      const occ = recheck.occurrences[0];
      items.push({
        id: `e${items.length + 1}`,
        documentId,
        quote: occ.exactSourceText,
        startOffset: occ.start,
        endOffset: occ.end,
        pageIndices: occ.pageIndices,
        sectionLabel: passage.sectionLabel,
        occurrenceIndex: occ.occurrenceIndex
      });
      used += occ.exactSourceText.length;
      truncated = true;
      continue;
    }

    items.push({
      id: `e${items.length + 1}`,
      documentId,
      quote: candidate.quote,
      startOffset: candidate.startOffset,
      endOffset: candidate.endOffset,
      pageIndices: candidate.pageIndices,
      sectionLabel: passage.sectionLabel,
      occurrenceIndex: candidate.occurrenceIndex
    });
    used += candidate.quote.length;
  }

  return {items, truncated, rejectedPassages};
}

function selectPassageQuote(
  passage: RetrievedPassage,
  source: CanonicalSource
): {quote: string; startOffset: number; endOffset: number; pageIndices: number[]; occurrenceIndex: number} | null {
  // Prefer exact slice from canonical offsets when they match stored content.
  if (
    passage.startOffset >= 0 &&
    passage.endOffset > passage.startOffset &&
    passage.endOffset <= source.text.length
  ) {
    const slice = source.text.slice(passage.startOffset, passage.endOffset);
    if (slice === passage.content || whitespaceEqual(slice, passage.content)) {
      const verified = verifyQuote(source, slice);
      if (verified.verified) {
        // Prefer the occurrence that matches the passage offsets when possible.
        const preferred =
          verified.occurrences.find(o => o.start === passage.startOffset && o.end === passage.endOffset) ??
          verified.occurrences[0];
        return {
          quote: preferred.exactSourceText,
          startOffset: preferred.start,
          endOffset: preferred.end,
          pageIndices: preferred.pageIndices.length ? preferred.pageIndices : passage.pageIndices,
          occurrenceIndex: preferred.occurrenceIndex
        };
      }
    }
  }

  // Fallback: verify passage content as a proposed quote (whitespace-tolerant).
  const verified = verifyQuote(source, passage.content);
  if (!verified.verified || !verified.occurrences.length) return null;
  const occ = verified.occurrences[0];
  return {
    quote: occ.exactSourceText,
    startOffset: occ.start,
    endOffset: occ.end,
    pageIndices: occ.pageIndices,
    occurrenceIndex: occ.occurrenceIndex
  };
}

function whitespaceEqual(a: string, b: string): boolean {
  return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
}

function trimToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const slice = text.slice(0, budget);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > budget * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

/** Look up evidence by id; returns undefined for invented IDs. */
export function getEvidenceById(registry: EvidenceItem[], id: string): EvidenceItem | undefined {
  return registry.find(item => item.id === id);
}

export interface MultiDocEvidenceSource {
  documentId: string;
  documentName: string;
  source: CanonicalSource;
  retrieval: RetrievalResult;
}

export interface PreparedMultiEvidence extends PreparedEvidence {
  /** Evidence counts after budgeting, keyed by document. */
  countsByDocument: Record<string, number>;
}

/**
 * Build a single cross-document evidence registry with globally unique IDs (e1…).
 * Each document receives a fair share of the aggregate budget so one strong hit
 * cannot starve another selected contract.
 */
export function prepareMultiDocumentEvidenceRegistry(
  docs: MultiDocEvidenceSource[],
  options: {charBudget?: number} = {}
): PreparedMultiEvidence {
  const aggregateBudget = options.charBudget ?? MULTI_DOC_EVIDENCE_CHAR_BUDGET;
  const n = Math.max(1, docs.length);
  const perDocBudget = Math.max(800, Math.floor(aggregateBudget / n));

  const items: EvidenceItem[] = [];
  const countsByDocument: Record<string, number> = {};
  let truncated = false;
  let rejectedPassages = 0;
  let used = 0;

  for (const doc of docs) {
    countsByDocument[doc.documentId] = 0;
    const local = prepareEvidenceRegistry(doc.documentId, doc.source, doc.retrieval, {
      charBudget: perDocBudget
    });
    rejectedPassages += local.rejectedPassages;
    if (local.truncated) truncated = true;

    for (const item of local.items) {
      if (used + item.quote.length > aggregateBudget && items.length > 0) {
        truncated = true;
        break;
      }
      const id = `e${items.length + 1}`;
      items.push({
        ...item,
        id,
        documentName: doc.documentName
      });
      countsByDocument[doc.documentId] = (countsByDocument[doc.documentId] ?? 0) + 1;
      used += item.quote.length;
    }
  }

  return {items, truncated, rejectedPassages, countsByDocument};
}
