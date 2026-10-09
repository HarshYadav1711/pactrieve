import type {PdfTextItem} from "../documents/pdf-text.ts";

/** Origin of one UTF-16 code unit in reconstructed page text. */
export interface CharOrigin {
  /** Index into the PDF.js text-content items array, or -1 for synthetic whitespace. */
  itemIndex: number;
  /** Offset within item.str, or -1 for synthetic chars. */
  itemChar: number;
}

export interface ReconstructedPageMap {
  text: string;
  origins: CharOrigin[];
  items: PdfTextItem[];
}

/**
 * Reconstruct page text with the same geometry rules as `reconstructPdfPage`,
 * while recording which text-content item owns each character.
 */
export function reconstructPageWithMap(rawItems: readonly (PdfTextItem | object)[]): ReconstructedPageMap {
  // Preserve original getTextContent indices so they align with TextLayer.textDivs.
  const items: PdfTextItem[] = [];
  const sourceIndex: number[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item || !("str" in item) || typeof (item as PdfTextItem).str !== "string") continue;
    items.push(item as PdfTextItem);
    sourceIndex.push(i);
  }

  let text = "";
  const origins: CharOrigin[] = [];
  let previous: PdfTextItem | null = null;

  const pushSynthetic = (ch: string) => {
    text += ch;
    for (let i = 0; i < ch.length; i++) origins.push({itemIndex: -1, itemChar: -1});
  };

  const pushItemChars = (textContentIndex: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      text += str[i];
      origins.push({itemIndex: textContentIndex, itemChar: i});
    }
  };

  for (let index = 0; index < items.length; index++) {
    const current = items[index];
    const textContentIndex = sourceIndex[index]!;
    const x = current.transform?.[4];
    const y = current.transform?.[5];
    const prevX = previous?.transform?.[4];
    const prevY = previous?.transform?.[5];
    const fontSize = Math.abs(previous?.transform?.[3] ?? 10);

    if (current.str) {
      if (previous && text && !/\s$/u.test(text) && !/^\s/u.test(current.str)) {
        if (typeof y === "number" && typeof prevY === "number" && Math.abs(y - prevY) > Math.max(2, fontSize * 0.35)) {
          pushSynthetic("\n");
        } else if (typeof x === "number" && typeof prevX === "number" && typeof previous.width === "number") {
          const visualGap = x - (prevX + previous.width);
          if (visualGap > Math.max(1.2, fontSize * 0.16)) pushSynthetic(" ");
        }
      }
      pushItemChars(textContentIndex, current.str);
    }
    if (current.hasEOL && !text.endsWith("\n")) pushSynthetic("\n");
    previous = current.hasEOL ? null : current;
  }

  // Match reconstructPdfPage: trim leading/trailing whitespace and drop matching origins.
  let start = 0;
  let end = text.length;
  while (start < end && /\s/u.test(text[start]!)) start++;
  while (end > start && /\s/u.test(text[end - 1]!)) end--;
  return {
    text: text.slice(start, end),
    origins: origins.slice(start, end),
    items
  };
}
