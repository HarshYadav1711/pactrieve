import type {PageBoundary} from "../evidence/verify.ts";
import {alignPageLocalRange, type AlignFailureReason, type AlignedItemSpan} from "./align.ts";
import {splitCanonicalRange} from "./page-ranges.ts";
import type {ReconstructedPageMap} from "./reconstruct-map.ts";

export interface CitationLocateInput {
  documentId: string;
  citationDocumentId: string;
  startOffset: number;
  endOffset: number;
  pages: readonly PageBoundary[];
  /** Canonical page bodies keyed by pageIndex (from stored extraction). */
  canonicalPageText: ReadonlyMap<number, string>;
  /** Live PDF.js reconstructions keyed by pageIndex. */
  pageMaps: ReadonlyMap<number, ReconstructedPageMap>;
}

export interface LocatedPageHighlight {
  pageIndex: number;
  itemSpans: AlignedItemSpan[];
  quote: string;
  renderStart: number;
  renderEnd: number;
}

export interface CitationLocateSuccess {
  ok: true;
  pages: LocatedPageHighlight[];
  /** First page to scroll into view. */
  focusPageIndex: number;
}

export interface CitationLocateFailure {
  ok: false;
  reason:
    | "WRONG_DOCUMENT"
    | "INVALID_OFFSETS"
    | "NO_PAGES"
    | "MISSING_PAGE_TEXT"
    | "MISSING_PAGE_MAP"
    | "ALIGN_FAILED";
  alignReason?: AlignFailureReason;
  detail?: string;
  /** Best-effort page to navigate when highlight alignment fails. */
  fallbackPageIndex?: number;
}

export type CitationLocateResult = CitationLocateSuccess | CitationLocateFailure;

/**
 * Locate a verified citation on rendered PDF text layers.
 * Does not re-verify the quote — callers must only pass server-verified citations.
 */
export function locateCitationOnPdf(input: CitationLocateInput): CitationLocateResult {
  if (input.citationDocumentId !== input.documentId) {
    return {ok: false, reason: "WRONG_DOCUMENT"};
  }
  if (
    !Number.isFinite(input.startOffset) ||
    !Number.isFinite(input.endOffset) ||
    input.endOffset <= input.startOffset
  ) {
    return {ok: false, reason: "INVALID_OFFSETS"};
  }

  const ranges = splitCanonicalRange(input.pages, input.startOffset, input.endOffset);
  if (!ranges.length) {
    return {ok: false, reason: "NO_PAGES", detail: "Offsets fall outside stored page boundaries."};
  }

  const located: LocatedPageHighlight[] = [];
  for (const range of ranges) {
    const canonical = input.canonicalPageText.get(range.pageIndex);
    if (canonical === undefined) {
      return {
        ok: false,
        reason: "MISSING_PAGE_TEXT",
        fallbackPageIndex: range.pageIndex,
        detail: `No canonical text for page ${range.pageIndex + 1}`
      };
    }
    const pageMap = input.pageMaps.get(range.pageIndex);
    if (!pageMap) {
      return {
        ok: false,
        reason: "MISSING_PAGE_MAP",
        fallbackPageIndex: range.pageIndex,
        detail: `PDF text layer not ready for page ${range.pageIndex + 1}`
      };
    }
    const aligned = alignPageLocalRange(pageMap, canonical, range.localStart, range.localEnd);
    if (!aligned.ok) {
      return {
        ok: false,
        reason: "ALIGN_FAILED",
        alignReason: aligned.reason,
        detail: aligned.detail,
        fallbackPageIndex: range.pageIndex
      };
    }
    located.push({
      pageIndex: range.pageIndex,
      itemSpans: aligned.itemSpans,
      quote: aligned.quote,
      renderStart: aligned.renderStart,
      renderEnd: aligned.renderEnd
    });
  }

  return {
    ok: true,
    pages: located,
    focusPageIndex: located[0]!.pageIndex
  };
}
