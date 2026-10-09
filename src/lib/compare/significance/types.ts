import {z} from "zod";
import type {ChangeKind, SourceFocus} from "../types.ts";

export type Severity = "high" | "medium" | "low" | "review_needed";

export type SignificanceStatus =
  | "analyzed"
  | "skipped_unchanged"
  | "review_needed"
  | "failed";

export type AnalysisMethod = "deterministic" | "deterministic+llm" | "deterministic_fallback";

export type ChangeSignalKind =
  | "monetary"
  | "duration"
  | "modal"
  | "negation"
  | "party"
  | "percentage"
  | "topic"
  | "jurisdiction"
  | "structural";

export interface MoneyAmount {
  raw: string;
  currency: string | null;
  /** Numeric magnitude with commas stripped; null if unparseable. */
  value: number | null;
}

export interface DurationAmount {
  raw: string;
  /** Approximate days for comparison (30 days/month, 365 days/year). */
  days: number;
  unit: "day" | "month" | "year";
  count: number;
}

export interface ChangeSignal {
  kind: ChangeSignalKind;
  label: string;
  detail: string;
  /** Machine-readable facts used for grounding checks. */
  facts: Record<string, string | number | boolean | null>;
}

export interface ChangeSignificance {
  changeId: string;
  changeType: ChangeKind;
  severity: Severity;
  significanceStatus: SignificanceStatus;
  summary: string;
  practicalEffect: string | null;
  changeSignals: ChangeSignal[];
  confidence: "high" | "medium" | "low";
  reviewReasons: string[];
  originalSource: SourceFocus | null;
  revisedSource: SourceFocus | null;
  analysisMethod: AnalysisMethod;
}

export interface SeverityCounts {
  high: number;
  medium: number;
  low: number;
  review_needed: number;
}

export interface ComparisonOverview {
  totalChanged: number;
  severityCounts: SeverityCounts;
  /** Up to a few change IDs that deserve first attention. */
  highlightChangeIds: string[];
  broadThemes: string[];
  notes: string[];
}

export type SeverityFilter = "all" | Severity | "changed";

export type SortMode = "severity_desc" | "severity_asc" | "document_order";

export const llmEnrichmentItemSchema = z.object({
  changeId: z.string().min(1).max(32),
  summary: z.string().min(1).max(600),
  practicalEffect: z.string().max(500).nullable().optional(),
  reviewReasons: z.array(z.string().max(240)).max(6).optional(),
  suggestedSeverity: z.enum(["high", "medium", "low", "review_needed"]).optional(),
  uncertainty: z.string().max(400).nullable().optional()
});

export const llmEnrichmentBatchSchema = z.object({
  items: z.array(llmEnrichmentItemSchema).max(12)
});

export type LlmEnrichmentItem = z.infer<typeof llmEnrichmentItemSchema>;
