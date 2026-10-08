/** Source-offset preserving overlapping text chunks. Phrase and section aware chunking is next. */
export function createChunks(text: string, maxChars = 2000, overlap = 260) {
  if (maxChars <= 0 || overlap < 0 || overlap >= maxChars) throw new Error("Invalid chunk sizing");
  const chunks: {chunkIndex: number; startOffset: number; endOffset: number; content: string}[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const lastBoundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(". ", end));
      if (lastBoundary > start + Math.floor(maxChars * .65)) end = lastBoundary + 1;
    }
    chunks.push({chunkIndex: chunks.length, startOffset: start, endOffset: end, content: text.slice(start, end)});
    if (end === text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}
