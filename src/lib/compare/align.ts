import {textSimilarity} from "./normalize.ts";
import type {ChangeKind, ComparisonBlock, ComparisonChange} from "./types.ts";

const UNCHANGED_FLOOR = 0.985;
const MODIFIED_FLOOR = 0.42;
const MOVE_FLOOR = 0.92;
/** Structural keys alone are unreliable (renumbering); require strong text support. */
const STRUCTURAL_FLOOR = 0.58;
const ORDER_WINDOW = 12;
const MAX_CANDIDATE_PAIRS = 25_000;

export interface AlignResult {
  changes: ComparisonChange[];
  candidatePairs: number;
  lowConfidencePairs: number;
}

interface PairScore {
  oi: number;
  ri: number;
  score: number;
  structural: boolean;
}

/**
 * Order-aware, bounded clause alignment.
 * Prefer structural keys, then local-order similarity; leftovers become added/removed.
 */
export function alignBlocks(
  original: ComparisonBlock[],
  revised: ComparisonBlock[]
): AlignResult {
  const usedO = new Set<number>();
  const usedR = new Set<number>();
  const changes: ComparisonChange[] = [];
  let candidatePairs = 0;
  let lowConfidencePairs = 0;
  let changeSeq = 0;

  const pushChange = (
    kind: ChangeKind,
    confidence: ComparisonChange["confidence"],
    o: ComparisonBlock | null,
    r: ComparisonBlock | null,
    rationale: string
  ) => {
    changes.push({
      id: `c${changeSeq++}`,
      kind,
      confidence,
      original: o,
      revised: r,
      rationale,
      significance: null
    });
  };

  // Stage A — strong structural matching (unique structural keys).
  const oByKey = groupByKey(original);
  const rByKey = groupByKey(revised);
  for (const [key, oIdxs] of oByKey) {
    const rIdxs = rByKey.get(key);
    if (!rIdxs || oIdxs.length !== 1 || rIdxs.length !== 1) continue;
    const oi = oIdxs[0]!;
    const ri = rIdxs[0]!;
    if (usedO.has(oi) || usedR.has(ri)) continue;
    const score = textSimilarity(original[oi]!.normalizedText, revised[ri]!.normalizedText);
    candidatePairs += 1;
    // Renumbering can reuse the same number for a different clause — do not force a weak pair.
    if (score < STRUCTURAL_FLOOR) continue;
    usedO.add(oi);
    usedR.add(ri);
    classifyPair(original[oi]!, revised[ri]!, score, true, pushChange);
    if (score < 0.7) lowConfidencePairs += 1;
  }

  // Stage B/C — bounded order-aware greedy matching for leftovers.
  const candidates: PairScore[] = [];
  for (let oi = 0; oi < original.length; oi++) {
    if (usedO.has(oi)) continue;
    const oBlock = original[oi]!;
    const rStart = Math.max(0, oi - ORDER_WINDOW);
    const rEnd = Math.min(revised.length - 1, oi + ORDER_WINDOW);
    // Also scan full revised list for near-exact moves (bounded).
    const scanIndexes = new Set<number>();
    for (let ri = rStart; ri <= rEnd; ri++) scanIndexes.add(ri);
    for (let ri = 0; ri < revised.length; ri++) {
      if (usedR.has(ri)) continue;
      if (textSimilarity(oBlock.normalizedText, revised[ri]!.normalizedText) >= MOVE_FLOOR) {
        scanIndexes.add(ri);
      }
    }
    for (const ri of scanIndexes) {
      if (usedR.has(ri)) continue;
      const score = textSimilarity(oBlock.normalizedText, revised[ri]!.normalizedText);
      candidatePairs += 1;
      if (candidatePairs > MAX_CANDIDATE_PAIRS) break;
      if (score < MODIFIED_FLOOR) continue;
      candidates.push({oi, ri, score, structural: false});
    }
    if (candidatePairs > MAX_CANDIDATE_PAIRS) break;
  }

  candidates.sort((a, b) => b.score - a.score || Math.abs(a.oi - a.ri) - Math.abs(b.oi - b.ri) || a.oi - b.oi);

  for (const cand of candidates) {
    if (usedO.has(cand.oi) || usedR.has(cand.ri)) continue;
    usedO.add(cand.oi);
    usedR.add(cand.ri);
    classifyPair(original[cand.oi]!, revised[cand.ri]!, cand.score, false, pushChange);
    if (cand.score < 0.7) lowConfidencePairs += 1;
  }

  // Stage D — leftovers.
  for (let oi = 0; oi < original.length; oi++) {
    if (usedO.has(oi)) continue;
    pushChange("removed", "high", original[oi]!, null, "No sufficiently similar revised counterpart.");
  }
  for (let ri = 0; ri < revised.length; ri++) {
    if (usedR.has(ri)) continue;
    pushChange("added", "high", null, revised[ri]!, "No sufficiently similar original counterpart.");
  }

  // Stable presentation: by original order, then revised order for pure adds.
  changes.sort((a, b) => {
    const ao = a.original?.orderIndex ?? Number.MAX_SAFE_INTEGER;
    const bo = b.original?.orderIndex ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    const ar = a.revised?.orderIndex ?? Number.MAX_SAFE_INTEGER;
    const br = b.revised?.orderIndex ?? Number.MAX_SAFE_INTEGER;
    return ar - br;
  });

  return {changes, candidatePairs, lowConfidencePairs};
}

function classifyPair(
  o: ComparisonBlock,
  r: ComparisonBlock,
  score: number,
  structural: boolean,
  push: (
    kind: ChangeKind,
    confidence: ComparisonChange["confidence"],
    o: ComparisonBlock | null,
    r: ComparisonBlock | null,
    rationale: string
  ) => void
) {
  const orderDelta = Math.abs(o.orderIndex - r.orderIndex);
  const keyChanged =
    Boolean(o.structuralKey && r.structuralKey && o.structuralKey !== r.structuralKey) ||
    Boolean(o.sectionLabel && r.sectionLabel && o.sectionLabel !== r.sectionLabel);

  if (score >= UNCHANGED_FLOOR) {
    if (orderDelta >= 3 || (keyChanged && orderDelta >= 1)) {
      push(
        "moved",
        "high",
        o,
        r,
        structural
          ? "Near-identical text under matching structure, relocated in document order."
          : "Near-identical text relocated or renumbered."
      );
      return;
    }
    push(
      "unchanged",
      "high",
      o,
      r,
      keyChanged
        ? "Textually equivalent after safe normalization; heading/number cosmetic difference only."
        : "Textually equivalent after safe normalization."
    );
    return;
  }

  if (score >= MOVE_FLOOR && orderDelta >= 3) {
    push("moved", "medium", o, r, "High textual similarity with substantial order change.");
    return;
  }

  if (score >= MODIFIED_FLOOR) {
    const confidence = score >= 0.7 ? "high" : score >= 0.55 ? "medium" : "low";
    if (confidence === "low") {
      push("uncertain", "low", o, r, `Possible modification (similarity ${score.toFixed(2)}); alignment is tentative.`);
      return;
    }
    push("modified", confidence, o, r, `Aligned counterpart with textual differences (similarity ${score.toFixed(2)}).`);
    return;
  }

  push("uncertain", "low", o, r, `Weak similarity (${score.toFixed(2)}); kept as uncertain rather than forced match.`);
}

function groupByKey(blocks: ComparisonBlock[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  blocks.forEach((b, i) => {
    if (!b.structuralKey) return;
    const list = map.get(b.structuralKey) ?? [];
    list.push(i);
    map.set(b.structuralKey, list);
  });
  return map;
}
