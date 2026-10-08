import {z} from "zod";

export const MAX_BYTES = 30 * 1024 * 1024;
export const DOCUMENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
} as const;

export const uploadInputSchema = z.object({
  name: z.string().min(1).max(240),
  mimeType: z.enum([DOCUMENT_TYPES.pdf, DOCUMENT_TYPES.docx]),
  sizeBytes: z.number().int().positive().max(MAX_BYTES)
}).refine(({name,mimeType}) => {
  const ext = name.toLowerCase().split(".").pop();
  return (ext === "pdf" && mimeType === DOCUMENT_TYPES.pdf) ||
    (ext === "docx" && mimeType === DOCUMENT_TYPES.docx);
}, {message: "File extension and MIME type do not match. Only PDF and DOCX are accepted."});

export type AllowedDocumentType = typeof DOCUMENT_TYPES[keyof typeof DOCUMENT_TYPES];

export function checkFileSignature(buffer: Buffer, mimeType: string): void {
  if (mimeType === DOCUMENT_TYPES.pdf) {
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("This file is not a valid PDF (missing PDF signature).");
    }
    return;
  }
  if (mimeType === DOCUMENT_TYPES.docx) {
    // DOCX is a ZIP-based OOXML package. Mammoth performs further structural validation.
    if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new Error("This file is not a valid DOCX (missing ZIP signature).");
    }
    return;
  }
  throw new Error("Only PDF and DOCX files are accepted.");
}
