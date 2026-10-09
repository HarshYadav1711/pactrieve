import type {PageBoundary} from "../evidence/verify.ts";

/** One page's slice of a canonical citation range (UTF-16 offsets). */
export interface PageLocalRange {
  pageIndex: number;
  /** Inclusive start in the full canonical source. */
  globalStart: number;
  /** Exclusive end in the full canonical source. */
  globalEnd: number;
  /** Offset within page.text (canonical page body, after page separators). */
  localStart: number;
  localEnd: number;
}

/**
 * Split a verified canonical [start, end) range across page boundaries.
 * Uses persisted page boundaries — never model-supplied page numbers.
 */
export function splitCanonicalRange(
  pages: readonly PageBoundary[],
  start: number,
  end: number
): PageLocalRange[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const out: PageLocalRange[] = [];
  for (const page of pages) {
    const globalStart = Math.max(start, page.start);
    const globalEnd = Math.min(end, page.end);
    if (globalStart >= globalEnd) continue;
    out.push({
      pageIndex: page.pageIndex,
      globalStart,
      globalEnd,
      localStart: globalStart - page.start,
      localEnd: globalEnd - page.start
    });
  }
  return out;
}

/** Derive page indices for a range when stored citations omit them. */
export function pageIndicesForRange(
  pages: readonly PageBoundary[],
  start: number,
  end: number
): number[] {
  return splitCanonicalRange(pages, start, end).map(p => p.pageIndex);
}
