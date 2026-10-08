import {DOCUMENT_TYPES, checkFileSignature, type AllowedDocumentType} from "./validate.ts";
import {reconstructPdfPage} from "./pdf-text.ts";

export interface ExtractedDocument {
  pages: {pageIndex: number; text: string}[];
  pageCount: number | null; // DOCX has no stable pagination independent of renderer.
  unreadablePageCount: number;
}

function isPasswordError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  return /password|encrypt/i.test(message) || /PasswordException|Password/i.test(name);
}

export async function extractDocument(buffer: Buffer, mimeType: AllowedDocumentType): Promise<ExtractedDocument> {
  checkFileSignature(buffer, mimeType);
  if (mimeType === DOCUMENT_TYPES.docx) {
    const mammoth = (await import("mammoth")).default;
    let parsed;
    try {
      parsed = await mammoth.extractRawText({buffer});
    } catch {
      throw new Error("This DOCX could not be read. It may be corrupt or not a valid Word document.");
    }
    const text = parsed.value.trim();
    if (!text) throw new Error("No readable text was extracted from this DOCX.");
    // A DOCX preview will use semantic HTML; logical text index 0 is not a physical page.
    return {pages: [{pageIndex: 0, text}], pageCount: null, unreadablePageCount: 0};
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let pdf;
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false
    });
    pdf = await task.promise;
  } catch (error) {
    if (isPasswordError(error)) {
      throw new Error("This PDF appears to be password-protected or encrypted. Remove protection and try again.");
    }
    const detail = error instanceof Error ? error.message : String(error);
    console.error("pdfjs getDocument failed:", detail);
    throw new Error("This PDF could not be opened. It may be corrupt or unsupported.");
  }

  try {
    const pages: ExtractedDocument["pages"] = [];
    let unreadablePageCount = 0;
    for (let index = 0; index < pdf.numPages; index++) {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      const text = reconstructPdfPage(content.items);
      if (!text) unreadablePageCount++;
      pages.push({pageIndex: index, text});
    }
    if (pages.length !== pdf.numPages) {
      throw new Error("PDF extraction stopped early; not all pages were processed.");
    }
    if (!pages.some(p => p.text.length > 0)) {
      throw new Error("This PDF has no readable text. It may be a scanned/image-only document; OCR is not yet supported.");
    }
    return {pages, pageCount: pdf.numPages, unreadablePageCount};
  } finally {
    await pdf.destroy();
  }
}
