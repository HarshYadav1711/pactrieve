/** Structure-aware, offset-preserving chunks for legal contracts. */

export interface DocumentChunk {
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  content: string;
  /** Best-effort clause/heading label for this chunk's primary span; null if unknown. */
  sectionLabel: string | null;
}

export interface SectionSpan {
  label: string;
  startOffset: number;
  endOffset: number; // exclusive
}

const HEADING_PATTERNS: RegExp[] = [
  /^(?:ARTICLE|SECTION|CLAUSE|SCHEDULE|APPENDIX|ANNEX)\s+[\dIVXLC]+(?:\.\d+)*\b.*$/imu,
  /^\d+(?:\.\d+){0,4}\.?\s+[A-Z(].*$/mu,
  /^\([a-z]\)\s+\S.*$/mu,
  /^\([ivx]+\)\s+\S.*$/mu,
  /^[A-Z][A-Z0-9 ,/&()'“”"-]{7,}$/mu
];

export function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 180) return false;
  // Ignore synthetic/page markers and obvious filler notes.
  if (/^\[PAGE\b/i.test(trimmed) || /^note\s+\d+\b/i.test(trimmed) || /^page\s+\d+\s+of\s+\d+/i.test(trimmed)) {
    return false;
  }
  return HEADING_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(trimmed);
  });
}

export function detectSections(text: string): SectionSpan[] {
  if (!text) return [];
  const lines: {start: number; end: number; text: string}[] = [];
  let cursor = 0;
  while (cursor <= text.length) {
    const next = text.indexOf("\n", cursor);
    const end = next < 0 ? text.length : next;
    lines.push({start: cursor, end, text: text.slice(cursor, end)});
    if (next < 0) break;
    cursor = next + 1;
  }

  const headings: {label: string; start: number}[] = [];
  for (const line of lines) {
    if (isLikelyHeading(line.text)) {
      const label = line.text.trim().replace(/\s+/g, " ").slice(0, 120);
      headings.push({label, start: line.start});
    }
  }
  if (!headings.length) return [];

  const sections: SectionSpan[] = [];
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].start;
    const end = i + 1 < headings.length ? headings[i + 1].start : text.length;
    sections.push({label: headings[i].label, startOffset: start, endOffset: end});
  }
  return sections;
}

export function sectionLabelForRange(sections: SectionSpan[], start: number, end: number): string | null {
  if (!sections.length || end <= start) return null;
  let best: SectionSpan | null = null;
  let bestOverlap = 0;
  for (const section of sections) {
    const overlap = Math.min(section.endOffset, end) - Math.max(section.startOffset, start);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = section;
    }
  }
  return best && bestOverlap > 0 ? best.label : null;
}

function pushChunk(
  chunks: DocumentChunk[],
  text: string,
  start: number,
  end: number,
  sections: SectionSpan[]
) {
  if (end <= start) return;
  chunks.push({
    chunkIndex: chunks.length,
    startOffset: start,
    endOffset: end,
    content: text.slice(start, end),
    sectionLabel: sectionLabelForRange(sections, start, end)
  });
}

function splitLongSpan(
  text: string,
  spanStart: number,
  spanEnd: number,
  maxChars: number,
  overlap: number,
  sections: SectionSpan[],
  chunks: DocumentChunk[]
) {
  let start = spanStart;
  while (start < spanEnd) {
    let end = Math.min(start + maxChars, spanEnd);
    if (end < spanEnd) {
      const window = text.slice(start, end);
      const localBreak = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf("\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf("; ")
      );
      if (localBreak > Math.floor(maxChars * 0.55)) {
        end = start + localBreak + (window[localBreak] === "." || window[localBreak] === ";" ? 2 : 1);
      }
    }
    pushChunk(chunks, text, start, end, sections);
    if (end >= spanEnd) break;
    start = Math.max(start + 1, end - overlap);
  }
}

/**
 * Build overlapping chunks that prefer legal headings/clauses, then paragraph boundaries.
 * Offsets are UTF-16 code units in the canonical document text.
 */
export function createChunks(text: string, maxChars = 2000, overlap = 260): DocumentChunk[] {
  if (maxChars <= 0 || overlap < 0 || overlap >= maxChars) throw new Error("Invalid chunk sizing");
  if (!text) return [];

  const sections = detectSections(text);
  const chunks: DocumentChunk[] = [];

  if (!sections.length) {
    splitLongSpan(text, 0, text.length, maxChars, overlap, sections, chunks);
    return chunks;
  }

  // Pack consecutive section spans into chunks up to maxChars; never merge across a hard size bound.
  let packStart = sections[0].startOffset;
  let packEnd = sections[0].endOffset;
  let packLabelStart = 0;

  const flush = () => {
    if (packEnd - packStart <= maxChars) {
      pushChunk(chunks, text, packStart, packEnd, sections);
    } else {
      // Keep section labels meaningful by splitting inside the packed range.
      for (let i = packLabelStart; i < sections.length && sections[i].startOffset < packEnd; i++) {
        const sec = sections[i];
        if (sec.endOffset <= packStart) continue;
        const start = Math.max(sec.startOffset, packStart);
        const end = Math.min(sec.endOffset, packEnd);
        if (end - start <= maxChars) pushChunk(chunks, text, start, end, sections);
        else splitLongSpan(text, start, end, maxChars, overlap, sections, chunks);
      }
    }
  };

  for (let i = 1; i < sections.length; i++) {
    const next = sections[i];
    if (next.endOffset - packStart <= maxChars) {
      packEnd = next.endOffset;
    } else {
      flush();
      packStart = next.startOffset;
      packEnd = next.endOffset;
      packLabelStart = i;
    }
  }
  flush();

  // Leading text before the first detected heading.
  if (sections[0].startOffset > 0) {
    const headChunks: DocumentChunk[] = [];
    splitLongSpan(text, 0, sections[0].startOffset, maxChars, overlap, sections, headChunks);
    return [...headChunks, ...chunks].map((chunk, index) => ({...chunk, chunkIndex: index}));
  }

  return chunks;
}
