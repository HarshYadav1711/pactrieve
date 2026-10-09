import type {AlignedItemSpan} from "./align.ts";

export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Measure highlight rectangles for citation item spans against rendered text-layer divs.
 * Coordinates are relative to `pageElement`.
 */
export function measureItemSpanRects(
  pageElement: HTMLElement,
  textDivs: readonly HTMLElement[],
  spans: readonly AlignedItemSpan[]
): OverlayRect[] {
  const pageRect = pageElement.getBoundingClientRect();
  const out: OverlayRect[] = [];

  for (const span of spans) {
    const div = textDivs[span.itemIndex];
    if (!div) continue;
    const textNode = firstTextNode(div);
    if (!textNode || !textNode.textContent) continue;
    const len = textNode.textContent.length;
    if (len === 0) continue;
    const start = clamp(span.startChar, 0, len);
    const end = clamp(span.endChar, 0, len);
    if (end <= start) continue;

    const range = document.createRange();
    try {
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
    } catch {
      continue;
    }
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width < 0.5 || rect.height < 0.5) continue;
      out.push({
        left: rect.left - pageRect.left + pageElement.scrollLeft,
        top: rect.top - pageRect.top + pageElement.scrollTop,
        width: rect.width,
        height: rect.height
      });
    }
  }
  return out;
}

function firstTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return root as Text;
  for (const child of Array.from(root.childNodes)) {
    const found = firstTextNode(child);
    if (found) return found;
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
