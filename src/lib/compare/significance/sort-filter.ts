import type {ComparisonChange} from "../types.ts";
import type {ChangeSignificance, Severity, SeverityFilter, SortMode} from "./types.ts";

const SEVERITY_RANK: Record<Severity, number> = {
  high: 0,
  review_needed: 1,
  medium: 2,
  low: 3
};

export function filterChanges(
  changes: ComparisonChange[],
  filter: SeverityFilter
): ComparisonChange[] {
  if (filter === "all") return [...changes];
  if (filter === "changed") {
    return changes.filter(c => c.kind !== "unchanged");
  }
  return changes.filter(c => {
    const sev = c.significance?.severity;
    return sev === filter;
  });
}

export function sortChanges(changes: ComparisonChange[], mode: SortMode): ComparisonChange[] {
  const copy = [...changes];
  copy.sort((a, b) => compareForSort(a, b, mode));
  return copy;
}

export function compareForSort(a: ComparisonChange, b: ComparisonChange, mode: SortMode): number {
  if (mode === "document_order") {
    return documentOrder(a, b);
  }
  const sa = a.significance?.severity ?? "low";
  const sb = b.significance?.severity ?? "low";
  const ra = SEVERITY_RANK[sa];
  const rb = SEVERITY_RANK[sb];
  if (mode === "severity_desc") {
    if (ra !== rb) return ra - rb;
  } else {
    // severity_asc: low first, but review_needed still after high when ascending from low?
    // Explicit: low → medium → high → review_needed for asc (review last as distinct bucket)
    const ASC: Record<Severity, number> = {
      low: 0,
      medium: 1,
      high: 2,
      review_needed: 3
    };
    if (ASC[sa] !== ASC[sb]) return ASC[sa] - ASC[sb];
  }
  const doc = documentOrder(a, b);
  if (doc !== 0) return doc;
  return a.id.localeCompare(b.id);
}

function documentOrder(a: ComparisonChange, b: ComparisonChange): number {
  const ao = a.original?.orderIndex ?? a.revised?.orderIndex ?? Number.MAX_SAFE_INTEGER;
  const bo = b.original?.orderIndex ?? b.revised?.orderIndex ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  const ar = a.revised?.orderIndex ?? Number.MAX_SAFE_INTEGER;
  const br = b.revised?.orderIndex ?? Number.MAX_SAFE_INTEGER;
  if (ar !== br) return ar - br;
  return a.id.localeCompare(b.id);
}

export function countBySeverity(significances: ChangeSignificance[]): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    high: 0,
    medium: 0,
    low: 0,
    review_needed: 0
  };
  for (const s of significances) {
    if (s.changeType === "unchanged") continue;
    counts[s.severity] += 1;
  }
  return counts;
}
