/** Types for the Node legacy entrypoint until the full PDF.js dependency is installed. */
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export interface PdfPage {
    getTextContent(): Promise<{items: Array<{str: string; hasEOL: boolean; width: number; transform: number[]} | object>}>;
  }
  export interface PdfDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPage>;
    destroy(): Promise<void>;
  }
  export function getDocument(options: {
    data: Uint8Array;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
  }): {promise: Promise<PdfDocument>};
}
