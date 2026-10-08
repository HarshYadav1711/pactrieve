import type {DocumentChunk} from "../documents/chunks.ts";
import {detectSections, sectionLabelForRange} from "../documents/chunks.ts";
import type {RetrievedPassage} from "./types.ts";

export interface ExpandOptions {
  maxExpandedChars: number;
  neighborRadius?: number;
}

/**
 * Expand ranked hits with adjacent / same-section context.
 * Seed passages are always retained; expansion fills remaining budget only.
 */
export function expandPassages(
  documentId: string,
  canonicalText: string,
  chunks: DocumentChunk[],
  seed: RetrievedPassage[],
  options: ExpandOptions
): RetrievedPassage[] {
  if (!seed.length) return [];
  const radius = options.neighborRadius ?? 1;
  const sections = detectSections(canonicalText);
  const byIndex = new Map(chunks.map(chunk => [chunk.chunkIndex, chunk]));

  const seeds = seed
    .slice()
    .sort((a, b) => a.startOffset - b.startOffset)
    .map(passage => ({
      ...passage,
      content: canonicalText.slice(passage.startOffset, passage.endOffset)
    }));

  const selected = new Map<number, RetrievedPassage>();
  let used = 0;
  for (const passage of seeds) {
    selected.set(passage.chunkIndex, passage);
    used += Math.max(0, passage.endOffset - passage.startOffset);
  }

  const candidates: RetrievedPassage[] = [];
  for (const hit of seeds) {
    for (let delta = -radius; delta <= radius; delta++) {
      if (delta === 0) continue;
      const neighbor = byIndex.get(hit.chunkIndex + delta);
      if (!neighbor || selected.has(neighbor.chunkIndex)) continue;
      candidates.push({
        documentId,
        chunkId: null,
        chunkIndex: neighbor.chunkIndex,
        startOffset: neighbor.startOffset,
        endOffset: neighbor.endOffset,
        pageIndices: [],
        sectionLabel: neighbor.sectionLabel ?? sectionLabelForRange(sections, neighbor.startOffset, neighbor.endOffset),
        content: neighbor.content,
        score: hit.score * 0.35,
        matchKind: "expanded"
      });
    }
    if (hit.sectionLabel) {
      for (const chunk of chunks) {
        if (selected.has(chunk.chunkIndex)) continue;
        if (chunk.sectionLabel !== hit.sectionLabel) continue;
        // Prefer nearby same-section chunks over distant ones.
        const distance = Math.abs(chunk.chunkIndex - hit.chunkIndex);
        if (distance > 4) continue;
        candidates.push({
          documentId,
          chunkId: null,
          chunkIndex: chunk.chunkIndex,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          pageIndices: [],
          sectionLabel: chunk.sectionLabel,
          content: chunk.content,
          score: hit.score * 0.45,
          matchKind: "expanded"
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.startOffset - b.startOffset);
  for (const passage of candidates) {
    if (selected.has(passage.chunkIndex)) continue;
    const len = passage.endOffset - passage.startOffset;
    if (used + len > options.maxExpandedChars) continue;
    selected.set(passage.chunkIndex, {
      ...passage,
      content: canonicalText.slice(passage.startOffset, passage.endOffset)
    });
    used += len;
  }

  return [...selected.values()].sort((a, b) => a.startOffset - b.startOffset || b.score - a.score);
}
