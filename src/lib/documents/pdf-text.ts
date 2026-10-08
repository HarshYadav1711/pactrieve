/** Conservative PDF.js text-content reconstruction for extraction and search.
 * The PDF viewer's text layer is still the authority for visual highlights.
 */
export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  width?: number;
  transform?: number[];
}

export function reconstructPdfPage(items: readonly (PdfTextItem | object)[]): string {
  let text = "";
  let previous: PdfTextItem | null = null;

  for (const item of items) {
    if (!("str" in item) || typeof item.str !== "string") continue;
    const current = item as PdfTextItem;
    const x = current.transform?.[4];
    const y = current.transform?.[5];
    const prevX = previous?.transform?.[4];
    const prevY = previous?.transform?.[5];
    const fontSize = Math.abs(previous?.transform?.[3] ?? 10);

    if (current.str) {
      if (previous && text && !/\s$/u.test(text) && !/^\s/u.test(current.str)) {
        if (typeof y === "number" && typeof prevY === "number" && Math.abs(y-prevY) > Math.max(2,fontSize*.35)) {
          text += "\n";
        } else if (typeof x === "number" && typeof prevX === "number" && typeof previous.width === "number") {
          const visualGap = x - (prevX + previous.width);
          if (visualGap > Math.max(1.2,fontSize*.16)) text += " ";
        }
      }
      text += current.str;
    }
    if (current.hasEOL && !text.endsWith("\n")) text += "\n";
    previous = current.hasEOL ? null : current;
  }
  return text.trim();
}
