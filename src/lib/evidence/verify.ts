/**
 * Deterministic quote verification. No LLM-supplied source positions are trusted.
 * Offsets are JavaScript UTF-16 code-unit offsets in our canonical extracted text.
 */
export interface SourcePage {
  pageIndex: number;
  text: string;
}

export interface PageBoundary {
  pageIndex: number;
  start: number;
  end: number; // exclusive
}

export interface CanonicalSource {
  text: string;
  pages: PageBoundary[];
}

export interface VerifiedOccurrence {
  start: number;
  end: number;
  pageIndices: number[];
  exactSourceText: string;
  occurrenceIndex: number;
}

export interface VerificationResult {
  verified: boolean;
  normalizedQuote: string;
  occurrences: VerifiedOccurrence[];
  reason?: "EMPTY_QUOTE" | "NOT_FOUND";
}

export function createCanonicalSource(pages: SourcePage[]): CanonicalSource {
  const ordered = [...pages].sort((a, b) => a.pageIndex - b.pageIndex);
  let text = "";
  const boundaries: PageBoundary[] = [];
  for (const page of ordered) {
    if (boundaries.length > 0) text += "\n"; // page-break separator
    const start = text.length;
    text += page.text;
    boundaries.push({pageIndex: page.pageIndex, start, end: text.length});
  }
  return {text, pages: boundaries};
}

interface NormalizedText {
  text: string;
  originalOffset: number[];
}

/** Collapse whitespace only. Critically, we do not fuzzy-match words, digits or punctuation. */
export function normalizeWithSourceMap(input: string): NormalizedText {
  let text = "";
  const originalOffset: number[] = [];
  let spacePending = false;
  let firstSpaceOffset = -1;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (/\s/u.test(char)) {
      if (text.length > 0 && !spacePending) {
        firstSpaceOffset = i;
        spacePending = true;
      }
      continue;
    }
    if (spacePending) {
      text += " ";
      originalOffset.push(firstSpaceOffset);
      spacePending = false;
    }
    text += char;
    originalOffset.push(i);
  }
  return {text, originalOffset};
}

export function verifyQuote(source: CanonicalSource, proposedQuote: string): VerificationResult {
  const normalizedSource = normalizeWithSourceMap(source.text);
  const normalizedQuote = normalizeWithSourceMap(proposedQuote).text;
  if (!normalizedQuote) return {verified: false, normalizedQuote, occurrences: [], reason: "EMPTY_QUOTE"};

  const occurrences: VerifiedOccurrence[] = [];
  let from = 0;
  while (from <= normalizedSource.text.length - normalizedQuote.length) {
    const matchIndex = normalizedSource.text.indexOf(normalizedQuote, from);
    if (matchIndex < 0) break;
    const start = normalizedSource.originalOffset[matchIndex];
    const end = normalizedSource.originalOffset[matchIndex + normalizedQuote.length - 1] + 1;
    const pageIndices = source.pages
      .filter(page => page.start < end && page.end > start)
      .map(page => page.pageIndex);
    occurrences.push({start, end, pageIndices, exactSourceText: source.text.slice(start, end), occurrenceIndex: occurrences.length});
    from = matchIndex + 1;
  }
  return {
    verified: occurrences.length > 0,
    normalizedQuote,
    occurrences,
    ...(!occurrences.length ? {reason: "NOT_FOUND" as const} : {})
  };
}
