/**
 * Matching normalization for clause alignment.
 * Preserves numbers, negations, and modal verbs (shall/may/shall not).
 */

export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Extract a structural key such as "8.2", "12", "article-iv", "a" from a heading/label. */
export function extractStructuralKey(label: string | null | undefined): string | null {
  if (!label) return null;
  const t = label.trim();
  const article = t.match(/^(?:ARTICLE|SECTION|CLAUSE|SCHEDULE|APPENDIX|ANNEX)\s+([\dIVXLC]+(?:\.\d+)*)\b/i);
  if (article) return `${article[1]!.toLowerCase()}`;
  const numbered = t.match(/^(\d+(?:\.\d+){0,4})\.?(\s|$)/);
  if (numbered) return numbered[1]!;
  const letter = t.match(/^\(([a-z])\)\s/);
  if (letter) return `(${letter[1]})`;
  const roman = t.match(/^\(([ivx]+)\)\s/i);
  if (roman) return `(${roman[1]!.toLowerCase()})`;
  return null;
}

/** Tokenize for similarity; keep numbers and short function words that affect meaning. */
export function tokenize(normalized: string): string[] {
  return normalized
    .split(/[^a-z0-9]+/i)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

export function jaccardSimilarity(aTokens: string[], bTokens: string[]): number {
  if (!aTokens.length && !bTokens.length) return 1;
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Dice coefficient on token multisets — better for repeated boilerplate. */
export function diceSimilarity(aTokens: string[], bTokens: string[]): number {
  if (!aTokens.length && !bTokens.length) return 1;
  if (!aTokens.length || !bTokens.length) return 0;
  const counts = new Map<string, number>();
  for (const t of aTokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  let inter = 0;
  for (const t of bTokens) {
    const c = counts.get(t) ?? 0;
    if (c > 0) {
      inter += 1;
      counts.set(t, c - 1);
    }
  }
  return (2 * inter) / (aTokens.length + bTokens.length);
}

export function textSimilarity(aNorm: string, bNorm: string): number {
  if (aNorm === bNorm) return 1;
  const a = tokenize(aNorm);
  const b = tokenize(bNorm);
  const jac = jaccardSimilarity(a, b);
  const dice = diceSimilarity(a, b);
  // Blend; length ratio softens matches between very different lengths.
  const lenRatio =
    Math.min(aNorm.length, bNorm.length) / Math.max(1, Math.max(aNorm.length, bNorm.length));
  return 0.45 * jac + 0.45 * dice + 0.1 * lenRatio;
}
