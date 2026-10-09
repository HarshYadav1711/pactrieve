import {normalizeWithSourceMap} from "../evidence/verify.ts";
import type {CharOrigin, ReconstructedPageMap} from "./reconstruct-map.ts";

export type AlignFailureReason =
  | "EMPTY_RANGE"
  | "OUT_OF_BOUNDS"
  | "CANONICAL_MISMATCH"
  | "NORMALIZED_NOT_FOUND"
  | "NO_TEXT_ITEMS"
  | "EMPTY_PAGE";

export interface AlignedItemSpan {
  itemIndex: number;
  /** Inclusive start within item.str */
  startChar: number;
  /** Exclusive end within item.str */
  endChar: number;
}

export interface PageAlignResult {
  ok: true;
  /** Offsets into reconstructed PDF.js page text. */
  renderStart: number;
  renderEnd: number;
  itemSpans: AlignedItemSpan[];
  quote: string;
}

export interface PageAlignFailure {
  ok: false;
  reason: AlignFailureReason;
  detail?: string;
}

export type PageAlignOutcome = PageAlignResult | PageAlignFailure;

/**
 * Map a page-local canonical range onto reconstructed PDF.js text items.
 *
 * Primary path: exact equality with stored/reconstructed page text (same algorithm as extraction).
 * Fallback: whitespace-tolerant alignment via normalizeWithSourceMap (never alters digits/words).
 */
export function alignPageLocalRange(
  pageMap: ReconstructedPageMap,
  canonicalPageText: string,
  localStart: number,
  localEnd: number
): PageAlignOutcome {
  if (localEnd <= localStart) return {ok: false, reason: "EMPTY_RANGE"};
  if (!pageMap.text) return {ok: false, reason: "EMPTY_PAGE"};
  if (localStart < 0 || localEnd > canonicalPageText.length) {
    return {ok: false, reason: "OUT_OF_BOUNDS", detail: `${localStart}:${localEnd} vs ${canonicalPageText.length}`};
  }

  const quote = canonicalPageText.slice(localStart, localEnd);
  if (!quote.trim()) return {ok: false, reason: "EMPTY_RANGE"};

  let renderStart: number;
  let renderEnd: number;

  if (pageMap.text === canonicalPageText) {
    renderStart = localStart;
    renderEnd = localEnd;
  } else {
    const aligned = alignViaNormalization(canonicalPageText, pageMap.text, localStart, localEnd);
    if (!aligned) {
      return {
        ok: false,
        reason: "CANONICAL_MISMATCH",
        detail: "Rendered page text could not be aligned to stored canonical page text."
      };
    }
    renderStart = aligned.start;
    renderEnd = aligned.end;
  }

  if (renderStart < 0 || renderEnd > pageMap.text.length || renderStart >= renderEnd) {
    return {ok: false, reason: "OUT_OF_BOUNDS", detail: "render range invalid"};
  }

  const itemSpans = originsToItemSpans(pageMap.origins, renderStart, renderEnd);
  if (!itemSpans.length) {
    return {ok: false, reason: "NO_TEXT_ITEMS", detail: "Range mapped only to synthetic whitespace."};
  }

  return {ok: true, renderStart, renderEnd, itemSpans, quote};
}

function alignViaNormalization(
  canonicalPageText: string,
  renderText: string,
  localStart: number,
  localEnd: number
): {start: number; end: number} | null {
  const canonNorm = normalizeWithSourceMap(canonicalPageText);
  const renderNorm = normalizeWithSourceMap(renderText);

  // Map localStart/localEnd to normalized indices.
  const normStart = findNormIndex(canonNorm.originalOffset, localStart, "start");
  const normEndExclusive = findNormIndex(canonNorm.originalOffset, localEnd - 1, "end");
  if (normStart < 0 || normEndExclusive < 0) return null;
  const needle = canonNorm.text.slice(normStart, normEndExclusive + 1);
  if (!needle) return null;

  // Prefer occurrence that corresponds to the same relative position when possible.
  const preferred = approxNormPosition(canonNorm.text.length, renderNorm.text.length, normStart);
  let matchAt = renderNorm.text.indexOf(needle, Math.max(0, preferred - 8));
  if (matchAt < 0) matchAt = renderNorm.text.indexOf(needle);
  if (matchAt < 0) return null;

  const startOrig = renderNorm.originalOffset[matchAt];
  const endOrig = renderNorm.originalOffset[matchAt + needle.length - 1];
  if (startOrig === undefined || endOrig === undefined) return null;
  return {start: startOrig, end: endOrig + 1};
}

function findNormIndex(
  originalOffset: number[],
  sourceOffset: number,
  mode: "start" | "end"
): number {
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

function approxNormPosition(canonLen: number, renderLen: number, normStart: number): number {
  if (canonLen <= 0) return 0;
  return Math.floor((normStart / canonLen) * renderLen);
}

export function originsToItemSpans(
  origins: readonly CharOrigin[],
  renderStart: number,
  renderEnd: number
): AlignedItemSpan[] {
  const byItem = new Map<number, {start: number; end: number}>();
  for (let i = renderStart; i < renderEnd; i++) {
    const origin = origins[i];
    if (!origin || origin.itemIndex < 0 || origin.itemChar < 0) continue;
    const cur = byItem.get(origin.itemIndex);
    if (!cur) byItem.set(origin.itemIndex, {start: origin.itemChar, end: origin.itemChar + 1});
    else {
      cur.start = Math.min(cur.start, origin.itemChar);
      cur.end = Math.max(cur.end, origin.itemChar + 1);
    }
  }
  return [...byItem.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([itemIndex, span]) => ({
      itemIndex,
      startChar: span.start,
      endChar: span.end
    }));
}
