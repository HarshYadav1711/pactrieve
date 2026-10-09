import {z} from "zod";
import type {ToolDefinition} from "../llm/types.ts";
import {AGENT_LIMITS} from "./limits.ts";

export const TOOL_NAMES = ["search_documents", "inspect_passage", "list_document_sections"] as const;
export type AgentToolName = (typeof TOOL_NAMES)[number];

export const searchDocumentsArgsSchema = z.object({
  query: z.string().trim().min(1).max(400),
  documentId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(AGENT_LIMITS.maxSearchResults).optional()
});

export const inspectPassageArgsSchema = z.object({
  passageRef: z.string().trim().min(1).max(64),
  expandChars: z.number().int().min(0).max(AGENT_LIMITS.maxInspectExpandChars).optional()
});

export const listSectionsArgsSchema = z.object({
  documentId: z.string().uuid(),
  filter: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(AGENT_LIMITS.maxSections).optional()
});

export type SearchDocumentsArgs = z.infer<typeof searchDocumentsArgsSchema>;
export type InspectPassageArgs = z.infer<typeof inspectPassageArgsSchema>;
export type ListSectionsArgs = z.infer<typeof listSectionsArgsSchema>;

export function agentToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "search_documents",
        description:
          "Search one or all selected contracts for passages matching a query. Use precise legal terms (liability, termination, notice, indemnity). Returns passage references you may later inspect.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: {type: "string", description: "Search query text."},
            documentId: {
              type: "string",
              description: "Optional UUID of one selected document. Omit to search all selected documents."
            },
            limit: {
              type: "integer",
              description: `Max passages per document (1–${AGENT_LIMITS.maxSearchResults}).`
            }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "inspect_passage",
        description:
          "Inspect a passage reference returned by a prior search (or section listing) with optional neighbouring context. Cannot invent references.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            passageRef: {
              type: "string",
              description: "Passage reference id from a previous tool result (e.g. p3)."
            },
            expandChars: {
              type: "integer",
              description: "Optional extra characters of surrounding context to include."
            }
          },
          required: ["passageRef"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "list_document_sections",
        description:
          "List detected section/clause headings for a selected document to guide subsequent searches.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            documentId: {type: "string", description: "UUID of a selected document."},
            filter: {type: "string", description: "Optional case-insensitive substring filter for headings."},
            limit: {type: "integer", description: `Max sections to return (1–${AGENT_LIMITS.maxSections}).`}
          },
          required: ["documentId"]
        }
      }
    }
  ];
}

export function isRegisteredToolName(name: string): name is AgentToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export function parseToolArgs(
  name: AgentToolName,
  rawArguments: string
):
  | {ok: true; args: SearchDocumentsArgs | InspectPassageArgs | ListSectionsArgs}
  | {ok: false; error: string} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments || "{}");
  } catch {
    return {ok: false, error: "Tool arguments are not valid JSON."};
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    // Reject obvious injection / shell / URL payloads in values.
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string" && looksHostile(value)) {
        return {ok: false, error: `Rejected hostile content in argument "${key}".`};
      }
    }
  }
  if (name === "search_documents") {
    const r = searchDocumentsArgsSchema.safeParse(parsed);
    if (!r.success) return {ok: false, error: r.error.issues[0]?.message ?? "Invalid search_documents arguments."};
    return {ok: true, args: r.data};
  }
  if (name === "inspect_passage") {
    const r = inspectPassageArgsSchema.safeParse(parsed);
    if (!r.success) return {ok: false, error: r.error.issues[0]?.message ?? "Invalid inspect_passage arguments."};
    return {ok: true, args: r.data};
  }
  const r = listSectionsArgsSchema.safeParse(parsed);
  if (!r.success) return {ok: false, error: r.error.issues[0]?.message ?? "Invalid list_document_sections arguments."};
  return {ok: true, args: r.data};
}

function looksHostile(value: string): boolean {
  return (
    /https?:\/\//i.test(value) ||
    /\b(SELECT|DROP|INSERT|DELETE)\b/i.test(value) ||
    /[;&|`$]/.test(value) ||
    /\bignore (all|previous) instructions\b/i.test(value)
  );
}

/** Fingerprint for identical-call bounding. */
export function toolCallFingerprint(name: string, argsJson: string): string {
  let normalized = argsJson;
  try {
    normalized = JSON.stringify(JSON.parse(argsJson));
  } catch {
    normalized = argsJson.trim();
  }
  return `${name}:${normalized}`;
}
