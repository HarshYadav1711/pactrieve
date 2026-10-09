import {normalizeWithSourceMap} from "../evidence/verify.ts";
import type {DocxLeafHighlight, TextLeafSpan} from "./types.ts";

export type DocxAlignFailure =
  | {ok: false; reason: "EMPTY_RANGE" | "OUT_OF_BOUNDS" | "NOT_FOUND" | "EMPTY_RENDER"; detail?: string};

export type DocxAlignSuccess = {
  ok: true;
  renderStart: number;
  renderEnd: number;
  leaves: DocxLeafHighlight[];
  quote: string;
};

export type DocxAlignResult = DocxAlignSuccess | DocxAlignFailure;

/**
 * Map UTF-16 offsets in stored canonical DOCX text onto flattened render text leaves.
 */
export function alignCanonicalToDocxLeaves(
  canonicalText: string,
  renderText: string,
  leaves: readonly TextLeafSpan[],
  startOffset: number,
  endOffset: number
): DocxAlignResult {
  if (endOffset <= startOffset) return {ok: false, reason: "EMPTY_RANGE"};
  if (!renderText.trim()) return {ok: false, reason: "EMPTY_RENDER"};
  if (startOffset < 0 || endOffset > canonicalText.length) {
    return {ok: false, reason: "OUT_OF_BOUNDS", detail: `${startOffset}:${endOffset}`};
  }

  const quote = canonicalText.slice(startOffset, endOffset);
  if (!quote.trim()) return {ok: false, reason: "EMPTY_RANGE"};

  // Map canonical offsets into renderText coordinates.
  let renderStart: number;
  let renderEnd: number;

  const trimmed = renderText.trim();
  const trimOffset = renderText.indexOf(trimmed);
  const safeTrimStart = trimOffset < 0 ? 0 : trimOffset;

  if (trimmed === canonicalText) {
    renderStart = safeTrimStart + startOffset;
    renderEnd = safeTrimStart + endOffset;
  } else if (renderText === canonicalText) {
    renderStart = startOffset;
    renderEnd = endOffset;
  } else {
    const aligned = alignViaNormalization(canonicalText, renderText, startOffset, endOffset);
    if (!aligned) {
      // Try against trimmed render text, then shift.
      const alignedTrim = alignViaNormalization(canonicalText, trimmed, startOffset, endOffset);
      if (!alignedTrim) return {ok: false, reason: "NOT_FOUND", detail: "Could not align citation to DOCX preview text."};
      renderStart = safeTrimStart + alignedTrim.start;
      renderEnd = safeTrimStart + alignedTrim.end;
    } else {
      renderStart = aligned.start;
      renderEnd = aligned.end;
    }
  }

  const leafHits = leavesForRange(leaves, renderStart, renderEnd);
  if (!leafHits.length) {
    return {ok: false, reason: "NOT_FOUND", detail: "Aligned range did not intersect any text leaf."};
  }

  return {ok: true, renderStart, renderEnd, leaves: leafHits, quote};
}

export function leavesForRange(
  leaves: readonly TextLeafSpan[],
  renderStart: number,
  renderEnd: number
): DocxLeafHighlight[] {
  const out: DocxLeafHighlight[] = [];
  for (const leaf of leaves) {
    const start = Math.max(renderStart, leaf.renderStart);
    const end = Math.min(renderEnd, leaf.renderEnd);
    if (start >= end) continue;
    out.push({
      leafIndex: leaf.leafIndex,
      blockId: leaf.blockId,
      startChar: start - leaf.renderStart,
      endChar: end - leaf.renderStart
    });
  }
  return out;
}

function alignViaNormalization(
  canonical: string,
  render: string,
  startOffset: number,
  endOffset: number
): {start: number; end: number} | null {
  const canonNorm = normalizeWithSourceMap(canonical);
  const renderNorm = normalizeWithSourceMap(render);
  const normStart = findNormIndex(canonNorm.originalOffset, startOffset, "start");
  const normEnd = findNormIndex(canonNorm.originalOffset, endOffset - 1, "end");
  if (normStart < 0 || normEnd < 0) return null;
  const needle = canonNorm.text.slice(normStart, normEnd + 1);
  if (!needle) return null;

  const preferred = canonNorm.text.length
    ? Math.floor((normStart / canonNorm.text.length) * renderNorm.text.length)
    : 0;
  let matchAt = renderNorm.text.indexOf(needle, Math.max(0, preferred - 8));
  if (matchAt < 0) matchAt = renderNorm.text.indexOf(needle);
  if (matchAt < 0) return null;
  const startOrig = renderNorm.originalOffset[matchAt];
  const endOrig = renderNorm.originalOffset[matchAt + needle.length - 1];
  if (startOrig === undefined || endOrig === undefined) return null;
  return {start: startOrig, end: endOrig + 1};
}

function findNormIndex(originalOffset: number[], sourceOffset: number, mode: "start" | "end"): number {
  if (mode === "start") {
    for (let i = 0; i < originalOffset.length; i++) {
      if (originalOffset[i]! >= sourceOffset) return i;
    }
    return -1;
  }
  for (let i = originalOffset.length - 1; i >= 0; i--) {
    if (originalOffset[i]! <= sourceOffset) return i;
  }
  return -1;
}
