import {z} from "zod";

export const compareRequestSchema = z.object({
  originalDocumentId: z.string().uuid("Invalid original document ID."),
  revisedDocumentId: z.string().uuid("Invalid revised document ID.")
});

export type CompareRequest = z.infer<typeof compareRequestSchema>;

export type VersionRole = "original" | "revised";

export type ChangeKind = "unchanged" | "modified" | "added" | "removed" | "moved" | "uncertain";

/** Source focus for viewers — not an LLM citation. */
export interface SourceFocus {
  documentId: string;
  startOffset: number;
  endOffset: number;
  pageIndices?: number[];
  occurrenceIndex?: number;
}

export interface ComparisonBlock {
  id: string;
  documentId: string;
  role: VersionRole;
  text: string;
  startOffset: number;
  endOffset: number;
  pageIndices: number[];
  sectionLabel: string | null;
  /** Stable structural key when present (e.g. "8.2", "article-iv"). */
  structuralKey: string | null;
  orderIndex: number;
  /** Matching-only normalization; never replaces authoritative `text`. */
  normalizedText: string;
}

export interface ComparisonChange {
  id: string;
  kind: ChangeKind;
  confidence: "high" | "medium" | "low";
  original: ComparisonBlock | null;
  revised: ComparisonBlock | null;
  /** Short machine-readable rationale for the classification. */
  rationale: string;
}

export interface ComparisonCoverage {
  originalPageCount: number | null;
  revisedPageCount: number | null;
  originalUnreadablePages: number;
  revisedUnreadablePages: number;
  originalBlockCount: number;
  revisedBlockCount: number;
  usedSectionSegmentation: boolean;
  usedParagraphFallback: boolean;
  lowConfidencePairs: number;
  notes: string[];
}

export interface ComparisonSummary {
  unchanged: number;
  modified: number;
  added: number;
  removed: number;
  moved: number;
  uncertain: number;
}

export interface ComparisonDocumentMeta {
  id: string;
  name: string;
  mimeType: string;
  pageCount: number | null;
  unreadablePageCount: number;
}

export interface ComparisonResult {
  original: ComparisonDocumentMeta;
  revised: ComparisonDocumentMeta;
  changes: ComparisonChange[];
  summary: ComparisonSummary;
  coverage: ComparisonCoverage;
  metrics: {
    segmentMs: number;
    alignMs: number;
    totalMs: number;
    candidatePairs: number;
  };
}
