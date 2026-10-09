import type {ComparisonChange, ComparisonCoverage} from "../types.ts";
import type {ChangeSignal, Severity} from "./types.ts";

export interface RubricResult {
  severity: Severity;
  reviewReasons: string[];
  confidence: "high" | "medium" | "low";
}

const HIGH_TOPICS = new Set([
  "indemnity",
  "liability",
  "termination",
  "intellectual_property",
  "exclusivity",
  "assignment",
  "dispute_resolution",
  "data_use"
]);

/**
 * Transparent, conservative severity rubric based on observable signals and structural kind.
 * review_needed is distinct from low — it means classification is unreliable.
 */
export function applySeverityRubric(input: {
  change: ComparisonChange;
  signals: ChangeSignal[];
  coverage: ComparisonCoverage;
}): RubricResult {
  const {change, signals, coverage} = input;
  const reviewReasons: string[] = [];

  if (change.kind === "uncertain" || change.confidence === "low") {
    reviewReasons.push("Structural alignment is low-confidence or uncertain.");
    return {severity: "review_needed", reviewReasons, confidence: "low"};
  }

  if (
    (change.kind === "added" || change.kind === "removed") &&
    (coverage.originalUnreadablePages > 0 || coverage.revisedUnreadablePages > 0)
  ) {
    reviewReasons.push(
      "Partial unreadable source pages: addition/removal is limited to readable extracted text."
    );
    return {severity: "review_needed", reviewReasons, confidence: "low"};
  }

  if (change.kind === "unchanged") {
    return {severity: "low", reviewReasons, confidence: "high"};
  }

  if (change.kind === "moved") {
    const oNorm = change.original?.normalizedText ?? "";
    const rNorm = change.revised?.normalizedText ?? "";
    const textuallySame = Boolean(oNorm && oNorm === rNorm);
    const onlyStructuralOrSharedTopic =
      signals.length === 0 ||
      signals.every(s => s.kind === "structural" || (s.kind === "topic" && s.facts.presence === "both"));
    if (textuallySame || onlyStructuralOrSharedTopic) {
      return {
        severity: "low",
        reviewReasons: ["Relocation/renumbering without detected substantive text change."],
        confidence: "high"
      };
    }
  }

  let score: Severity = "low";
  let confidence: "high" | "medium" | "low" = change.confidence;

  for (const signal of signals) {
    if (signal.kind === "monetary") {
      const direction = String(signal.facts.direction ?? "");
      if (direction === "currency_mismatch") {
        reviewReasons.push(signal.detail);
        return {severity: "review_needed", reviewReasons, confidence: "low"};
      }
      if (direction === "increased" || direction === "decreased" || direction === "changed") {
        score = bump(score, "high");
        reviewReasons.push(signal.detail);
      } else if (direction === "added" || direction === "removed") {
        score = bump(score, "high");
        reviewReasons.push(signal.detail);
      }
    }

    if (signal.kind === "negation" || signal.kind === "modal") {
      score = bump(score, "high");
      reviewReasons.push(signal.detail);
    }

    if (signal.kind === "jurisdiction") {
      score = bump(score, "high");
      reviewReasons.push(signal.detail);
    }

    if (signal.kind === "party") {
      score = bump(score, "high");
      reviewReasons.push(signal.detail);
      reviewReasons.push("Ambiguous party-role change may require manual confirmation.");
      // Keep high but note review — do not force review_needed unless ambiguous alone
    }

    if (signal.kind === "duration" || signal.kind === "percentage") {
      score = bump(score, "medium");
      reviewReasons.push(signal.detail);
    }

    if (signal.kind === "topic") {
      const topic = String(signal.facts.topic ?? signal.label);
      const presence = String(signal.facts.presence ?? "");
      if (HIGH_TOPICS.has(topic) && (presence === "added" || presence === "removed")) {
        score = bump(score, "high");
        reviewReasons.push(signal.detail);
      } else if (HIGH_TOPICS.has(topic)) {
        score = bump(score, score === "low" ? "medium" : score);
        reviewReasons.push(signal.detail);
      } else {
        score = bump(score, "medium");
      }
    }
  }

  if (change.kind === "added" || change.kind === "removed") {
    if (signals.length === 0) {
      score = bump(score, "medium");
      reviewReasons.push(
        change.kind === "added"
          ? "New provision appears in revised readable text; legal effect depends on full contract context."
          : "Original provision has no aligned counterpart in revised readable text; other clauses may still address the topic."
      );
    }
  }

  if (change.kind === "modified" && signals.length === 0) {
    // Text changed but no classified signal — medium with review note, not invented high.
    score = bump(score, "medium");
    reviewReasons.push("Wording changed without a classified high-priority signal; review recommended.");
    confidence = confidence === "high" ? "medium" : confidence;
  }

  // Cosmetic-only: moved with structural only already handled; modified with only formatting
  // is rare after Phase 8 unchanged floor — if we somehow get here with empty signals and
  // near-identical, keep low.
  if (change.kind === "modified" && signals.length === 0 && change.confidence === "high") {
    // already medium above
  }

  return {
    severity: score,
    reviewReasons: unique(reviewReasons),
    confidence
  };
}

function bump(current: Severity, next: Severity): Severity {
  const order: Severity[] = ["low", "medium", "high", "review_needed"];
  // review_needed only set explicitly; bump among low/medium/high
  if (current === "review_needed") return current;
  if (next === "review_needed") return next;
  return order.indexOf(next) > order.indexOf(current) ? next : current;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
