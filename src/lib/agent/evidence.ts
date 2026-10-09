import type {CanonicalSource} from "../evidence/verify.ts";
import type {EvidenceItem} from "../chat/types.ts";
import {AGENT_LIMITS} from "./limits.ts";

export interface IssuedPassage {
  ref: string;
  documentId: string;
  documentName: string;
  startOffset: number;
  endOffset: number;
  pageIndices: number[];
  sectionLabel: string | null;
  quote: string;
  evidenceId: string;
}

export interface AgentEvidenceRegistry {
  /** Globally unique evidence items for final citation (e1…). */
  evidence: EvidenceItem[];
  /** Session-issued passage refs the model may inspect (p1…). */
  passages: Map<string, IssuedPassage>;
  sourcesByDocumentId: Map<string, CanonicalSource>;
  namesByDocumentId: Map<string, string>;
}

export function createAgentEvidenceRegistry(
  documents: Array<{id: string; name: string; source: CanonicalSource}>
): AgentEvidenceRegistry {
  const sourcesByDocumentId = new Map<string, CanonicalSource>();
  const namesByDocumentId = new Map<string, string>();
  for (const d of documents) {
    sourcesByDocumentId.set(d.id, d.source);
    namesByDocumentId.set(d.id, d.name);
  }
  return {
    evidence: [],
    passages: new Map(),
    sourcesByDocumentId,
    namesByDocumentId
  };
}

/**
 * Register a source span as a passage ref + evidence item.
 * Deduplicates identical documentId+offsets into the same evidence id.
 */
export function registerPassage(
  registry: AgentEvidenceRegistry,
  input: {
    documentId: string;
    startOffset: number;
    endOffset: number;
    pageIndices: number[];
    sectionLabel: string | null;
    quote: string;
  }
): IssuedPassage | null {
  if (input.endOffset <= input.startOffset) return null;
  const source = registry.sourcesByDocumentId.get(input.documentId);
  if (!source) return null;
  const name = registry.namesByDocumentId.get(input.documentId) ?? "Document";

  const existing = [...registry.passages.values()].find(
    p =>
      p.documentId === input.documentId &&
      p.startOffset === input.startOffset &&
      p.endOffset === input.endOffset
  );
  if (existing) return existing;

  if (registry.evidence.length >= AGENT_LIMITS.maxEvidenceItems) return null;

  const evidenceId = `e${registry.evidence.length + 1}`;
  const passageRef = `p${registry.passages.size + 1}`;
  const item: EvidenceItem = {
    id: evidenceId,
    documentId: input.documentId,
    documentName: name,
    quote: input.quote,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    pageIndices: input.pageIndices,
    sectionLabel: input.sectionLabel,
    occurrenceIndex: 0
  };
  registry.evidence.push(item);
  const issued: IssuedPassage = {
    ref: passageRef,
    documentId: input.documentId,
    documentName: name,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    pageIndices: input.pageIndices,
    sectionLabel: input.sectionLabel,
    quote: input.quote,
    evidenceId
  };
  registry.passages.set(passageRef, issued);
  return issued;
}

export function getIssuedPassage(
  registry: AgentEvidenceRegistry,
  ref: string
): IssuedPassage | undefined {
  return registry.passages.get(ref);
}

export function truncateToolJson(value: unknown, maxChars: number): string {
  const raw = JSON.stringify(value);
  if (raw.length <= maxChars) return raw;
  return JSON.stringify({
    truncated: true,
    note: `Tool result truncated to ${maxChars} characters.`,
    preview: raw.slice(0, Math.max(0, maxChars - 120))
  });
}
