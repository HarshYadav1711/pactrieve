import type {CanonicalSource} from "../evidence/verify.ts";
import {alignBlocks} from "./align.ts";
import {assertBlockSlice, segmentDocument} from "./segment.ts";
import type {
  ComparisonCoverage,
  ComparisonDocumentMeta,
  ComparisonResult,
  ComparisonSummary
} from "./types.ts";

export interface CompareDocumentsInput {
  original: {
    meta: ComparisonDocumentMeta;
    source: CanonicalSource;
  };
  revised: {
    meta: ComparisonDocumentMeta;
    source: CanonicalSource;
  };
}

const MAX_CHANGES = 2_000;

/**
 * Deterministic clause/paragraph comparison of two contract versions.
 * Source offsets remain UTF-16 indices into each document's canonical text.
 */
export function compareDocumentSources(input: CompareDocumentsInput): ComparisonResult {
  const t0 = Date.now();
  if (input.original.meta.id === input.revised.meta.id) {
    throw Object.assign(new Error("Cannot compare a document to itself."), {status: 400});
  }

  const tSeg = Date.now();
  const origSeg = segmentDocument({
    documentId: input.original.meta.id,
    role: "original",
    text: input.original.source.text,
    pages: input.original.source.pages
  });
  const revSeg = segmentDocument({
    documentId: input.revised.meta.id,
    role: "revised",
    text: input.revised.source.text,
    pages: input.revised.source.pages
  });
  const segmentMs = Date.now() - tSeg;

  for (const block of origSeg.blocks) {
    if (!assertBlockSlice(input.original.source.text, block)) {
      throw new Error("Original block source slice mismatch.");
    }
  }
  for (const block of revSeg.blocks) {
    if (!assertBlockSlice(input.revised.source.text, block)) {
      throw new Error("Revised block source slice mismatch.");
    }
  }

  const tAlign = Date.now();
  const aligned = alignBlocks(origSeg.blocks, revSeg.blocks);
  const alignMs = Date.now() - tAlign;

  let changes = aligned.changes;
  const notes = [
    ...origSeg.notes.map(n => `Original: ${n}`),
    ...revSeg.notes.map(n => `Revised: ${n}`)
  ];

  if (input.original.meta.unreadablePageCount > 0 || input.revised.meta.unreadablePageCount > 0) {
    notes.push(
      "One or both versions include unreadable pages. Removals/additions are limited to readable extracted text and are not proof of absence in unread regions."
    );
  }

  if (changes.length > MAX_CHANGES) {
    notes.push(`Comparison truncated to ${MAX_CHANGES} change rows for response size bounds.`);
    changes = changes.slice(0, MAX_CHANGES);
  }

  const summary = summarize(changes);
  const coverage: ComparisonCoverage = {
    originalPageCount: input.original.meta.pageCount,
    revisedPageCount: input.revised.meta.pageCount,
    originalUnreadablePages: input.original.meta.unreadablePageCount,
    revisedUnreadablePages: input.revised.meta.unreadablePageCount,
    originalBlockCount: origSeg.blocks.length,
    revisedBlockCount: revSeg.blocks.length,
    usedSectionSegmentation: origSeg.usedSectionSegmentation || revSeg.usedSectionSegmentation,
    usedParagraphFallback: origSeg.usedParagraphFallback || revSeg.usedParagraphFallback,
    lowConfidencePairs: aligned.lowConfidencePairs,
    notes
  };

  return {
    original: input.original.meta,
    revised: input.revised.meta,
    changes,
    summary,
    coverage,
    metrics: {
      segmentMs,
      alignMs,
      totalMs: Date.now() - t0,
      candidatePairs: aligned.candidatePairs
    }
  };
}

function summarize(changes: ComparisonResult["changes"]): ComparisonSummary {
  const summary: ComparisonSummary = {
    unchanged: 0,
    modified: 0,
    added: 0,
    removed: 0,
    moved: 0,
    uncertain: 0
  };
  for (const change of changes) {
    summary[change.kind] += 1;
  }
  return summary;
}
