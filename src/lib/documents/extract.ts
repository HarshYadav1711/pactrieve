import {DOCUMENT_TYPES, checkFileSignature, type AllowedDocumentType} from "./validate";
import {reconstructPdfPage} from "./pdf-text";

export interface ExtractedDocument {
  pages: {pageIndex: number; text: string}[];
  pageCount: number | null; // DOCX has no stable pagination independent of renderer.
  unreadablePageCount: number;
}

export async function extractDocument(buffer: Buffer, mimeType: AllowedDocumentType): Promise<ExtractedDocument> {
  checkFileSignature(buffer, mimeType);
  if (mimeType === DOCUMENT_TYPES.docx) {
    const mammoth = (await import("mammoth")).default;
    const parsed = await mammoth.extractRawText({buffer});
    const text = parsed.value.trim();
    if (!text) throw new Error("No readable text was extracted from this DOCX.");
    // A DOCX preview will use semantic HTML; logical text index 0 is not a physical page.
    return {pages: [{pageIndex: 0, text}], pageCount: null, unreadablePageCount: 0};
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false});
  const pdf = await task.promise;
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
    if (!pages.some(p => p.text.length > 0)) {
      throw new Error("This PDF has no readable text. It may be a scanned/image-only document; OCR is not yet supported.");
    }
    return {pages, pageCount: pdf.numPages, unreadablePageCount};
  } finally {
    await pdf.destroy();
  }
}
