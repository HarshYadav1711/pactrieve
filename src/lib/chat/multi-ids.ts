/** Stable primary document id for persistence scoping (first sorted UUID). */
export function primaryDocumentId(documentIds: string[]): string {
  if (!documentIds.length) throw new Error("documentIds required");
  return [...documentIds].sort((a, b) => a.localeCompare(b))[0]!;
}

/** Deduplicate document IDs (case-insensitive) and return a stable sorted list. */
export function normalizeDocumentIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((a, b) => a.localeCompare(b));
}
