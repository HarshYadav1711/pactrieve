export type {
  DocxBlock,
  DocxInline,
  DocxPreviewModel,
  DocxLeafHighlight,
  DocxLocateResult,
  TextLeafSpan
} from "./types.ts";
export {mammothHtmlToSafeAst} from "./safe-html.ts";
export {flattenDocxBlocks} from "./flatten.ts";
export {alignCanonicalToDocxLeaves, leavesForRange} from "./align.ts";
export {buildDocxPreview} from "./preview.ts";
export {locateCitationOnDocx, type LocateDocxCitationInput} from "./locate.ts";
