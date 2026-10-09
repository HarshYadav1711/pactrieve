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
  type ComparisonOverview,
  type ChangeSignificance,
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
export {
  analyzeComparison,
  detectChangeSignals,
  applySeverityRubric,
  filterChanges,
  sortChanges,
  type Severity,
  type SeverityFilter,
  type SortMode
} from "./significance/index.ts";
/** Server-only enrichment — import from `@/lib/compare/significance` in API routes. */
