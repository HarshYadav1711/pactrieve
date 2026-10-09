import type {DocxBlock, DocxInline, DocxPreviewModel, TextLeafSpan} from "./types.ts";

/**
 * Flatten a safe AST into render text that approximates Mammoth extractRawText:
 * block units joined by "\n\n", then typically trimmed for canonical storage.
 * Mutates text inlines to attach leafIndex for DOM registration.
 */
export function flattenDocxBlocks(blocks: DocxBlock[]): Pick<DocxPreviewModel, "renderText" | "canonicalApprox" | "leaves"> {
  const leaves: TextLeafSpan[] = [];
  let cursor = 0;
  const chunks: string[] = [];

  function pushSeparator() {
    if (chunks.length === 0) return;
    if (chunks[chunks.length - 1] === "\n\n") return;
    chunks.push("\n\n");
    cursor += 2;
  }

  function pushText(blockId: string, node: Extract<DocxInline, {kind: "text"}>) {
    if (!node.text) return;
    const leafIndex = leaves.length;
    node.leafIndex = leafIndex;
    leaves.push({
      blockId,
      leafIndex,
      renderStart: cursor,
      renderEnd: cursor + node.text.length,
      text: node.text
    });
    chunks.push(node.text);
    cursor += node.text.length;
  }

  function walkInlines(blockId: string, inlines: DocxInline[]) {
    for (const node of inlines) {
      if (node.kind === "text") pushText(blockId, node);
      else if (node.kind === "br") {
        // Soft breaks contribute a newline to render text but are not highlight leaves.
        chunks.push("\n");
        cursor += 1;
      } else if (node.kind === "link") walkInlines(blockId, node.children);
    }
  }

  function walkBlocks(list: DocxBlock[]) {
    for (const block of list) {
      if (block.kind === "paragraph" || block.kind === "heading") {
        pushSeparator();
        walkInlines(block.id, block.children);
      } else if (block.kind === "list") {
        for (const item of block.items) {
          pushSeparator();
          walkInlines(item.id, item.children);
        }
      } else if (block.kind === "table") {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            if (cell.blocks.length) walkBlocks(cell.blocks);
          }
        }
      }
    }
  }

  walkBlocks(blocks);
  const renderText = chunks.join("");
  const canonicalApprox = renderText.trim();
  return {renderText, canonicalApprox, leaves};
}
