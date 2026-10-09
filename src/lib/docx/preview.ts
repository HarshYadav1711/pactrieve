import mammoth from "mammoth";
import {flattenDocxBlocks} from "./flatten.ts";
import {mammothHtmlToSafeAst} from "./safe-html.ts";
import type {DocxPreviewModel} from "./types.ts";

/**
 * Build a safe semantic DOCX preview model from the original file bytes.
 * Does not mutate the stored canonical extraction; callers align against it.
 */
export async function buildDocxPreview(buffer: Buffer): Promise<DocxPreviewModel> {
  let htmlResult: {value: string; messages: {type: string; message: string}[]};
  try {
    htmlResult = await mammoth.convertToHtml(
      {buffer},
      {
        // Keep structure; ignore images (no binary embedding into the viewer).
        convertImage: mammoth.images.imgElement(() => Promise.resolve({src: ""}))
      }
    );
  } catch {
    throw new Error("This DOCX could not be converted for preview.");
  }

  // Drop empty image tags Mammoth may emit.
  const cleanedHtml = htmlResult.value.replace(/<img\b[^>]*>/gi, "");
  const {blocks, warnings} = mammothHtmlToSafeAst(cleanedHtml);
  const flat = flattenDocxBlocks(blocks);

  for (const msg of htmlResult.messages ?? []) {
    if (msg.type === "error" || msg.type === "warning") {
      warnings.push(msg.message);
    }
  }

  if (!flat.canonicalApprox.trim()) {
    throw new Error("DOCX preview produced no readable text.");
  }

  return {
    blocks,
    renderText: flat.renderText,
    canonicalApprox: flat.canonicalApprox,
    leaves: flat.leaves,
    warnings
  };
}
