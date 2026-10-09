/** Safe semantic DOCX preview tree — never contains raw untrusted HTML. */

export type DocxInline =
  | {kind: "text"; text: string; bold?: boolean; italic?: boolean; leafIndex?: number}
  | {kind: "br"}
  | {kind: "link"; href: string; children: DocxInline[]};

export type DocxBlock =
  | {kind: "paragraph"; id: string; level?: 0; children: DocxInline[]}
  | {kind: "heading"; id: string; level: 1 | 2 | 3 | 4 | 5 | 6; children: DocxInline[]}
  | {kind: "list"; id: string; ordered: boolean; items: {id: string; children: DocxInline[]}[]}
  | {
      kind: "table";
      id: string;
      rows: {id: string; cells: {id: string; blocks: DocxBlock[]}[]}[];
    };

export interface TextLeafSpan {
  /** Stable id of the owning block or list item (for scroll targets). */
  blockId: string;
  /** Index of this text leaf within the document leaf list. */
  leafIndex: number;
  /** Offsets into flattenRenderText(output). */
  renderStart: number;
  renderEnd: number;
  text: string;
}

export interface DocxPreviewModel {
  blocks: DocxBlock[];
  /** Flattened text approximating Mammoth extractRawText (pre-trim). */
  renderText: string;
  /** Same as extraction: trim() of renderText. */
  canonicalApprox: string;
  leaves: TextLeafSpan[];
  warnings: string[];
}

export interface DocxLeafHighlight {
  leafIndex: number;
  blockId: string;
  /** Inclusive start within the leaf text. */
  startChar: number;
  /** Exclusive end within the leaf text. */
  endChar: number;
}

export type DocxLocateSuccess = {
  ok: true;
  leaves: DocxLeafHighlight[];
  focusBlockId: string;
  quote: string;
};

export type DocxLocateFailure = {
  ok: false;
  reason:
    | "WRONG_DOCUMENT"
    | "INVALID_OFFSETS"
    | "ALIGN_FAILED"
    | "EMPTY_PREVIEW"
    | "NO_LEAVES";
  detail?: string;
  /** Still scroll to a best-effort block when known. */
  fallbackBlockId?: string;
};

export type DocxLocateResult = DocxLocateSuccess | DocxLocateFailure;
