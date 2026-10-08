/** Query normalization helpers for legal lexical retrieval (no stemming assumptions). */

const AMOUNT_RE = /\b(?:AED|USD|EUR|GBP|INR)\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/gi;
const DAYS_RE = /\b\d{1,4}\s+days?\b/gi;
const SECTION_RE = /\b(?:section|clause|article)\s+\d+(?:\.\d+)*\b/gi;
const MODAL_PHRASE_RE = /\b(?:shall not|may not|shall|may terminate|must not|will not)\b/gi;

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

export function extractExactPhrases(query: string): string[] {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const phrases = new Set<string>();
  for (const re of [AMOUNT_RE, DAYS_RE, SECTION_RE, MODAL_PHRASE_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized))) phrases.add(match[0]);
  }
  // Quoted spans
  for (const match of normalized.matchAll(/"([^"]{2,120})"/g)) phrases.add(match[1]);
  if (normalized.length <= 80) phrases.add(normalized);
  return [...phrases];
}

/** Tokens safe for plainto_tsquery('simple', ...) — keep alphanumerics; drop empties. */
export function ftsTerms(query: string): string[] {
  return normalizeQuery(query)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(t => t.trim())
    .filter(t => t.length >= 2)
    .slice(0, 24);
}

export function looksLikeExistenceQuestion(query: string): boolean {
  return /\b(is there|are there|does .+ (contain|include|have)|any .+ clause|find .*if|whether .+ (exists|provides)|absent|missing)\b/i
    .test(query);
}
