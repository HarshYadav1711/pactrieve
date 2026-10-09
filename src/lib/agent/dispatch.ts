import {detectSections} from "../documents/chunks.ts";
import type {RetrievalRequest, RetrievalResult} from "../retrieval/types.ts";
import {AGENT_LIMITS} from "./limits.ts";
import {
  getIssuedPassage,
  registerPassage,
  truncateToolJson,
  type AgentEvidenceRegistry
} from "./evidence.ts";
import type {
  AgentToolName,
  InspectPassageArgs,
  ListSectionsArgs,
  SearchDocumentsArgs
} from "./tools.ts";

export interface AgentDocumentContext {
  id: string;
  name: string;
}

export interface DispatchInput {
  name: AgentToolName;
  args: SearchDocumentsArgs | InspectPassageArgs | ListSectionsArgs;
  permittedDocumentIds: string[];
  documents: AgentDocumentContext[];
  registry: AgentEvidenceRegistry;
  retrieve: (request: RetrievalRequest) => Promise<RetrievalResult>;
}

export interface DispatchResult {
  ok: boolean;
  /** Structured payload returned to the model (JSON-serializable). */
  payload: unknown;
  activityDetail: string;
  errorCode?: string;
}

export async function dispatchAgentTool(input: DispatchInput): Promise<DispatchResult> {
  try {
    if (input.name === "search_documents") {
      return await runSearch(input, input.args as SearchDocumentsArgs);
    }
    if (input.name === "inspect_passage") {
      return runInspect(input, input.args as InspectPassageArgs);
    }
    return runListSections(input, input.args as ListSectionsArgs);
  } catch (error) {
    return {
      ok: false,
      payload: {
        error: error instanceof Error ? error.message : "Tool execution failed."
      },
      activityDetail: "Tool execution failed.",
      errorCode: "TOOL_EXECUTION_FAILED"
    };
  }
}

async function runSearch(
  input: DispatchInput,
  args: SearchDocumentsArgs
): Promise<DispatchResult> {
  const targetIds = args.documentId
    ? [args.documentId]
    : [...input.permittedDocumentIds];

  for (const id of targetIds) {
    if (!input.permittedDocumentIds.includes(id)) {
      return {
        ok: false,
        payload: {error: "documentId is outside the selected document set."},
        activityDetail: "Rejected out-of-scope document search.",
        errorCode: "DOCUMENT_SCOPE"
      };
    }
  }

  const limit = args.limit ?? Math.min(4, AGENT_LIMITS.maxSearchResults);
  const results: unknown[] = [];
  const names = new Map(input.documents.map(d => [d.id, d.name]));

  for (const documentId of targetIds) {
    const retrieval = await input.retrieve({
      documentId,
      query: args.query,
      limit,
      mode: "ranked",
      expand: true,
      maxExpandedChars: 3500
    });
    const passages = [];
    for (const p of retrieval.passages.slice(0, limit)) {
      const issued = registerPassage(input.registry, {
        documentId: p.documentId,
        startOffset: p.startOffset,
        endOffset: p.endOffset,
        pageIndices: p.pageIndices,
        sectionLabel: p.sectionLabel,
        quote: p.content
      });
      if (!issued) continue;
      passages.push({
        passageRef: issued.ref,
        evidenceId: issued.evidenceId,
        documentId: issued.documentId,
        documentName: issued.documentName,
        sectionLabel: issued.sectionLabel,
        pageIndices: issued.pageIndices,
        startOffset: issued.startOffset,
        endOffset: issued.endOffset,
        excerpt: clip(issued.quote, 500),
        score: p.score,
        matchKind: p.matchKind
      });
    }
    results.push({
      documentId,
      documentName: names.get(documentId) ?? documentId,
      query: args.query,
      coverageStatus: retrieval.coverage.status,
      coverageNotes: retrieval.coverage.notes,
      passages
    });
  }

  const payload = {
    tool: "search_documents",
    query: args.query,
    results
  };
  return {
    ok: true,
    payload: JSON.parse(truncateToolJson(payload, AGENT_LIMITS.maxToolResultChars)),
    activityDetail: `Searched ${targetIds.length} document(s) for “${args.query.slice(0, 60)}”.`
  };
}

function runInspect(input: DispatchInput, args: InspectPassageArgs): DispatchResult {
  const issued = getIssuedPassage(input.registry, args.passageRef);
  if (!issued) {
    return {
      ok: false,
      payload: {error: "Unknown passageRef. Only references from prior tool results are allowed."},
      activityDetail: "Rejected forged or unknown passage reference.",
      errorCode: "UNKNOWN_PASSAGE_REF"
    };
  }
  if (!input.permittedDocumentIds.includes(issued.documentId)) {
    return {
      ok: false,
      payload: {error: "Passage belongs to a document outside the selected set."},
      activityDetail: "Rejected out-of-scope passage inspection.",
      errorCode: "DOCUMENT_SCOPE"
    };
  }

  const source = input.registry.sourcesByDocumentId.get(issued.documentId);
  if (!source) {
    return {
      ok: false,
      payload: {error: "Source text unavailable for this passage."},
      activityDetail: "Passage source unavailable.",
      errorCode: "SOURCE_UNAVAILABLE"
    };
  }

  const expand = args.expandChars ?? 400;
  const start = Math.max(0, issued.startOffset - expand);
  const end = Math.min(source.text.length, issued.endOffset + expand);
  const contextText = source.text.slice(start, end);

  // Re-register expanded span as additional evidence when expansion added material.
  let contextEvidenceId = issued.evidenceId;
  if (start !== issued.startOffset || end !== issued.endOffset) {
    const expanded = registerPassage(input.registry, {
      documentId: issued.documentId,
      startOffset: start,
      endOffset: end,
      pageIndices: issued.pageIndices,
      sectionLabel: issued.sectionLabel,
      quote: contextText
    });
    if (expanded) contextEvidenceId = expanded.evidenceId;
  }

  const payload = {
    tool: "inspect_passage",
    passageRef: issued.ref,
    evidenceId: issued.evidenceId,
    contextEvidenceId,
    documentId: issued.documentId,
    documentName: issued.documentName,
    sectionLabel: issued.sectionLabel,
    pageIndices: issued.pageIndices,
    startOffset: start,
    endOffset: end,
    coreStartOffset: issued.startOffset,
    coreEndOffset: issued.endOffset,
    text: clip(contextText, AGENT_LIMITS.maxInspectExpandChars + 800)
  };

  return {
    ok: true,
    payload: JSON.parse(truncateToolJson(payload, AGENT_LIMITS.maxToolResultChars)),
    activityDetail: `Inspected ${issued.ref} in ${issued.documentName}${
      issued.sectionLabel ? ` (${issued.sectionLabel})` : ""
    }.`
  };
}

function runListSections(input: DispatchInput, args: ListSectionsArgs): DispatchResult {
  if (!input.permittedDocumentIds.includes(args.documentId)) {
    return {
      ok: false,
      payload: {error: "documentId is outside the selected document set."},
      activityDetail: "Rejected out-of-scope section listing.",
      errorCode: "DOCUMENT_SCOPE"
    };
  }
  const source = input.registry.sourcesByDocumentId.get(args.documentId);
  const name = input.registry.namesByDocumentId.get(args.documentId) ?? args.documentId;
  if (!source) {
    return {
      ok: false,
      payload: {error: "Document source unavailable."},
      activityDetail: "Section listing failed: source unavailable.",
      errorCode: "SOURCE_UNAVAILABLE"
    };
  }

  const filter = args.filter?.toLowerCase();
  const limit = args.limit ?? 20;
  let sections = detectSections(source.text);
  if (filter) {
    sections = sections.filter(s => s.label.toLowerCase().includes(filter));
  }
  const listed = sections.slice(0, limit).map(section => {
    const issued = registerPassage(input.registry, {
      documentId: args.documentId,
      startOffset: section.startOffset,
      endOffset: Math.min(section.endOffset, section.startOffset + 400),
      pageIndices: [],
      sectionLabel: section.label,
      quote: source.text.slice(section.startOffset, Math.min(section.endOffset, section.startOffset + 400))
    });
    return {
      label: section.label,
      startOffset: section.startOffset,
      endOffset: section.endOffset,
      passageRef: issued?.ref ?? null,
      evidenceId: issued?.evidenceId ?? null,
      preview: clip(source.text.slice(section.startOffset, section.startOffset + 160), 160)
    };
  });

  const payload = {
    tool: "list_document_sections",
    documentId: args.documentId,
    documentName: name,
    sectionCount: listed.length,
    sections: listed
  };

  return {
    ok: true,
    payload: JSON.parse(truncateToolJson(payload, AGENT_LIMITS.maxToolResultChars)),
    activityDetail: `Listed ${listed.length} section(s) in ${name}.`
  };
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
