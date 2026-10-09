import {detectSections, type SectionSpan} from "../documents/chunks.ts";
import type {PageBoundary} from "../evidence/verify.ts";
import {extractStructuralKey, normalizeForMatch} from "./normalize.ts";
import type {ComparisonBlock, VersionRole} from "./types.ts";

const MAX_BLOCK_CHARS = 4_000;
const MIN_PARAGRAPH_CHARS = 40;

export interface SegmentResult {
  blocks: ComparisonBlock[];
  usedSectionSegmentation: boolean;
  usedParagraphFallback: boolean;
  notes: string[];
}

/**
 * Deterministic clause/paragraph segmentation with source offsets.
 * Prefers detected legal headings; falls back to paragraph units.
 * Blocks cover the readable text without inventing continuous ranges across gaps.
 */
export function segmentDocument(input: {
  documentId: string;
  role: VersionRole;
  text: string;
  pages: PageBoundary[];
}): SegmentResult {
  const {documentId, role, text, pages} = input;
  const notes: string[] = [];
  if (!text.trim()) {
    return {blocks: [], usedSectionSegmentation: false, usedParagraphFallback: false, notes: ["Empty document text."]};
  }

  const sections = detectSections(text);
  const usedSectionSegmentation = sections.length > 0;
  let usedParagraphFallback = false;

  const rawSpans: {start: number; end: number; sectionLabel: string | null}[] = [];

  if (sections.length) {
    // Leading prose before first heading.
    if (sections[0]!.startOffset > 0) {
      usedParagraphFallback = true;
      pushParagraphSpans(rawSpans, text, 0, sections[0]!.startOffset, null);
    }
    for (const section of sections) {
      const bodySpans = splitSectionBody(text, section);
      if (bodySpans.length <= 1) {
        rawSpans.push({
          start: section.startOffset,
          end: section.endOffset,
          sectionLabel: section.label
        });
      } else {
        usedParagraphFallback = true;
        for (const span of bodySpans) {
          rawSpans.push({...span, sectionLabel: section.label});
        }
      }
    }
  } else {
    usedParagraphFallback = true;
    notes.push("No legal headings detected; using paragraph-level units.");
    pushParagraphSpans(rawSpans, text, 0, text.length, null);
  }

  // Ensure we did not leave uncovered interior gaps of non-whitespace.
  fillCoverageGaps(rawSpans, text);

  const blocks: ComparisonBlock[] = [];
  for (const span of rawSpans) {
    if (span.end <= span.start) continue;
    const slice = text.slice(span.start, span.end);
    if (!slice.trim()) continue;
    // Soft-split oversized blocks.
    if (slice.length > MAX_BLOCK_CHARS) {
      usedParagraphFallback = true;
      const parts = softSplit(text, span.start, span.end);
      for (const part of parts) {
        blocks.push(makeBlock(documentId, role, text, pages, part.start, part.end, span.sectionLabel, blocks.length));
      }
    } else {
      blocks.push(makeBlock(documentId, role, text, pages, span.start, span.end, span.sectionLabel, blocks.length));
    }
  }

  return {blocks, usedSectionSegmentation, usedParagraphFallback, notes};
}

function makeBlock(
  documentId: string,
  role: VersionRole,
  text: string,
  pages: PageBoundary[],
  start: number,
  end: number,
  sectionLabel: string | null,
  orderIndex: number
): ComparisonBlock {
  const content = text.slice(start, end);
  return {
    id: `${role}-${orderIndex}`,
    documentId,
    role,
    text: content,
    startOffset: start,
    endOffset: end,
    pageIndices: pageIndicesForRange(pages, start, end),
    sectionLabel,
    structuralKey: extractStructuralKey(sectionLabel) ?? extractStructuralKey(content.split("\n")[0] ?? null),
    orderIndex,
    normalizedText: normalizeForMatch(content)
  };
}

function splitSectionBody(
  text: string,
  section: SectionSpan
): {start: number; end: number}[] {
  const body = text.slice(section.startOffset, section.endOffset);
  // Keep short sections intact.
  if (body.length < 280 || body.split(/\n{2,}/).length < 2) {
    return [{start: section.startOffset, end: section.endOffset}];
  }
  const spans: {start: number; end: number}[] = [];
  pushParagraphSpans(spans, text, section.startOffset, section.endOffset, null);
  // If first span is only the heading line, keep it; merge tiny following fragments.
  return mergeTiny(spans);
}

function pushParagraphSpans(
  out: {start: number; end: number; sectionLabel?: string | null}[],
  text: string,
  from: number,
  to: number,
  sectionLabel: string | null
) {
  let cursor = from;
  while (cursor < to) {
    while (cursor < to && /\s/.test(text[cursor]!)) cursor += 1;
    if (cursor >= to) break;
    let breakAt = text.indexOf("\n\n", cursor);
    if (breakAt < 0 || breakAt >= to) breakAt = to;
    let end = breakAt;
    while (end > cursor && /\s/.test(text[end - 1]!)) end -= 1;
    if (end > cursor) {
      out.push({start: cursor, end, sectionLabel});
    }
    cursor = breakAt < to ? breakAt + 2 : to;
  }
}

function mergeTiny(spans: {start: number; end: number}[]): {start: number; end: number}[] {
  if (spans.length <= 1) return spans;
  const merged: {start: number; end: number}[] = [];
  let cur = {...spans[0]!};
  for (let i = 1; i < spans.length; i++) {
    const next = spans[i]!;
    if (cur.end - cur.start < MIN_PARAGRAPH_CHARS) {
      cur.end = next.end;
    } else {
      merged.push(cur);
      cur = {...next};
    }
  }
  merged.push(cur);
  return merged;
}

function softSplit(text: string, start: number, end: number): {start: number; end: number}[] {
  const parts: {start: number; end: number}[] = [];
  let cursor = start;
  while (cursor < end) {
    let cut = Math.min(cursor + MAX_BLOCK_CHARS, end);
    if (cut < end) {
      const window = text.slice(cursor, cut);
      const local = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("\n"));
      if (local > MAX_BLOCK_CHARS * 0.5) {
        cut = cursor + local + (window[local] === "." ? 2 : local >= 0 && window.slice(local, local + 2) === "\n\n" ? 2 : 1);
      }
    }
    parts.push({start: cursor, end: cut});
    cursor = cut;
  }
  return parts;
}

function fillCoverageGaps(
  spans: {start: number; end: number; sectionLabel: string | null}[],
  text: string
) {
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const filled: typeof spans = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      const gap = text.slice(cursor, span.start);
      if (gap.trim()) {
        filled.push({start: cursor, end: span.start, sectionLabel: null});
      }
    }
    filled.push(span);
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < text.length && text.slice(cursor).trim()) {
    filled.push({start: cursor, end: text.length, sectionLabel: null});
  }
  spans.length = 0;
  spans.push(...filled);
}

export function pageIndicesForRange(pages: PageBoundary[], start: number, end: number): number[] {
  if (!pages.length || end <= start) return [];
  const out: number[] = [];
  for (const page of pages) {
    if (page.end <= start || page.start >= end) continue;
    out.push(page.pageIndex);
  }
  return out;
}

/** Verify block text equals canonical slice. */
export function assertBlockSlice(canonical: string, block: ComparisonBlock): boolean {
  return canonical.slice(block.startOffset, block.endOffset) === block.text;
}
