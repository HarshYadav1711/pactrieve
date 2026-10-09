export {
  compareRequestSchema,
  type CompareRequest,
  type ChangeKind,
  type ComparisonBlock,
  type ComparisonChange,
  type ComparisonCoverage,
  type ComparisonDocumentMeta,
  type ComparisonResult,
  type ComparisonSummary,
  type SourceFocus,
  type VersionRole
} from "./types.ts";
export {compareDocumentSources, type CompareDocumentsInput} from "./compare.ts";
export {segmentDocument, assertBlockSlice, pageIndicesForRange} from "./segment.ts";
export {alignBlocks} from "./align.ts";
export {
  normalizeForMatch,
  extractStructuralKey,
  textSimilarity,
  tokenize
} from "./normalize.ts";
