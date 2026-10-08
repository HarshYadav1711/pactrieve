import {z} from "zod";

export const retrievalModeSchema = z.enum(["ranked", "existence"]);
export type RetrievalMode = z.infer<typeof retrievalModeSchema>;

export const retrievalRequestSchema = z.object({
  documentId: z.string().uuid(),
  query: z.string().min(1).max(500),
  limit: z.number().int().min(1).max(40).default(8),
  mode: retrievalModeSchema.default("ranked"),
  expand: z.boolean().default(true),
  maxExpandedChars: z.number().int().min(500).max(12000).default(4500)
});

export type RetrievalRequest = z.infer<typeof retrievalRequestSchema>;

/** Distinguishes evidence found from incomplete or inconclusive search — never “clause absent”. */
export type CoverageStatus =
  | "MATCHES_FOUND"
  | "NO_MATCH_ESTABLISHED"
  | "SEARCH_LIMITED"
  | "PARTIAL_SOURCE"
  | "DOCUMENT_UNAVAILABLE"
  | "SEARCH_FAILED";

export type MatchKind = "fts" | "phrase" | "section" | "literal" | "expanded";

export interface RetrievedPassage {
  documentId: string;
  chunkId: number | null;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  pageIndices: number[];
  sectionLabel: string | null;
  content: string;
  score: number;
  matchKind: MatchKind;
}

export interface RetrievalCoverage {
  status: CoverageStatus;
  searchablePageCount: number | null;
  unreadablePageCount: number;
  searchedChunkCount: number;
  totalChunkCount: number;
  mode: RetrievalMode;
  /** Human-readable caveats for later chat/agent phases — not completeness percentages. */
  notes: string[];
}

export interface RetrievalResult {
  documentId: string;
  query: string;
  passages: RetrievedPassage[];
  coverage: RetrievalCoverage;
}
