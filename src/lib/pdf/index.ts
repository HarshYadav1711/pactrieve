export {splitCanonicalRange, pageIndicesForRange, type PageLocalRange} from "./page-ranges.ts";
export {reconstructPageWithMap, type CharOrigin, type ReconstructedPageMap} from "./reconstruct-map.ts";
export {
  alignPageLocalRange,
  originsToItemSpans,
  type AlignedItemSpan,
  type AlignFailureReason,
  type PageAlignOutcome
} from "./align.ts";
export {
  locateCitationOnPdf,
  type CitationLocateInput,
  type CitationLocateResult,
  type LocatedPageHighlight
} from "./citation-locate.ts";
