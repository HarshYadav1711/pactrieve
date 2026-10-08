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
}).refine(({name, mimeType}) => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".doc") && !lower.endsWith(".docx")) return false;
  const ext = lower.split(".").pop();
  return (ext === "pdf" && mimeType === DOCUMENT_TYPES.pdf) ||
    (ext === "docx" && mimeType === DOCUMENT_TYPES.docx);
}, {message: "File extension and MIME type do not match. Only PDF and DOCX are accepted."});

export type AllowedDocumentType = typeof DOCUMENT_TYPES[keyof typeof DOCUMENT_TYPES];

/** Read ZIP central-directory entry names without adding a ZIP dependency. */
export function listZipEntryNames(buffer: Buffer): string[] {
  if (buffer.length < 22) return [];
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 65_536 - 22; i--) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let n = 0; n < totalEntries; n++) {
    if (offset + 46 > buffer.length) break;
    if (buffer[offset] !== 0x50 || buffer[offset + 1] !== 0x4b || buffer[offset + 2] !== 0x01 || buffer[offset + 3] !== 0x02) break;
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > buffer.length) break;
    names.push(buffer.subarray(nameStart, nameEnd).toString("utf8").replace(/\\/g, "/"));
    offset = nameEnd + extraLen + commentLen;
  }
  return names;
}

export function assertDocxPackage(buffer: Buffer): void {
  if (!buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new Error("This file is not a valid DOCX (missing ZIP signature).");
  }
  const names = listZipEntryNames(buffer);
  if (!names.length) {
    throw new Error("This file is not a valid DOCX (corrupt or incomplete ZIP package).");
  }
  const normalized = new Set(names.map(n => n.replace(/^\.\//, "")));
  if (![...normalized].some(n => n === "[Content_Types].xml")) {
    throw new Error("This file is not a valid DOCX (missing [Content_Types].xml).");
  }
  if (![...normalized].some(n => n === "word/document.xml" || n.endsWith("/word/document.xml"))) {
    throw new Error("This file is not a valid Word document (missing word/document.xml). A ZIP archive is not enough.");
  }
}

export function checkFileSignature(buffer: Buffer, mimeType: string): void {
  if (!buffer.length) {
    throw new Error("The uploaded file is empty.");
  }
  if (mimeType === DOCUMENT_TYPES.pdf) {
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("This file is not a valid PDF (missing PDF signature).");
    }
    // Heuristic: encrypted PDFs usually declare /Encrypt in the trailer dictionary.
    if (/\/Encrypt[\s\/<\[]/u.test(buffer.subarray(0, Math.min(buffer.length, 2_000_000)).toString("latin1"))) {
      throw new Error("This PDF appears to be password-protected or encrypted. Remove protection and try again.");
    }
    return;
  }
  if (mimeType === DOCUMENT_TYPES.docx) {
    assertDocxPackage(buffer);
    return;
  }
  throw new Error("Only PDF and DOCX files are accepted.");
}
