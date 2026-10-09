import {alignCanonicalToDocxLeaves} from "./align.ts";
import type {DocxLocateResult, DocxPreviewModel} from "./types.ts";

export interface LocateDocxCitationInput {
  documentId: string;
  citationDocumentId: string;
  startOffset: number;
  endOffset: number;
  /** Stored canonical source text from extraction. */
  canonicalText: string;
  preview: DocxPreviewModel;
}

export function locateCitationOnDocx(input: LocateDocxCitationInput): DocxLocateResult {
  if (input.citationDocumentId !== input.documentId) {
    return {ok: false, reason: "WRONG_DOCUMENT"};
  }
  if (
    !Number.isFinite(input.startOffset) ||
    !Number.isFinite(input.endOffset) ||
    input.endOffset <= input.startOffset
  ) {
    return {ok: false, reason: "INVALID_OFFSETS"};
  }
  if (!input.preview.leaves.length) {
    return {ok: false, reason: "EMPTY_PREVIEW"};
  }

  const aligned = alignCanonicalToDocxLeaves(
    input.canonicalText,
    input.preview.renderText,
    input.preview.leaves,
    input.startOffset,
    input.endOffset
  );

  if (!aligned.ok) {
    return {
      ok: false,
      reason: "ALIGN_FAILED",
      detail: aligned.detail ?? aligned.reason,
      fallbackBlockId: input.preview.leaves[0]?.blockId
    };
  }

  if (!aligned.leaves.length) {
    return {ok: false, reason: "NO_LEAVES", detail: "No text leaves for aligned range."};
  }

  return {
    ok: true,
    leaves: aligned.leaves,
    focusBlockId: aligned.leaves[0]!.blockId,
    quote: aligned.quote
  };
}
