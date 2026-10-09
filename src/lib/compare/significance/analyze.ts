import type {ComparisonChange, ComparisonCoverage, ComparisonResult, SourceFocus} from "../types.ts";
import {applySeverityRubric} from "./rubric.ts";
import {detectChangeSignals} from "./signals.ts";
import type {
  ChangeSignificance,
  ChangeSignal,
  ComparisonOverview,
  SeverityCounts
} from "./types.ts";

export interface AnalyzeComparisonResult {
  significances: ChangeSignificance[];
  overview: ComparisonOverview;
  deterministicMs: number;
}

/**
 * Deterministic significance layer over Phase 8 structural changes.
 * Does not re-align clauses; only annotates existing pairs.
 */
export function analyzeComparison(result: ComparisonResult): AnalyzeComparisonResult {
  const t0 = Date.now();
  const significances = result.changes.map(change =>
    analyzeChange(change, result.coverage)
  );
  const overview = buildOverview(significances, result.coverage.notes);
  return {
    significances,
    overview,
    deterministicMs: Date.now() - t0
  };
}

/** Rebuild overview after optional LLM enrichment mutates severities. */
export function rebuildOverview(
  significances: ChangeSignificance[],
  coverageNotes: string[]
): ComparisonOverview {
  return buildOverview(significances, coverageNotes);
}

export function analyzeChange(
  change: ComparisonChange,
  coverage: ComparisonCoverage
): ChangeSignificance {
  const originalSource = toFocus(change.original);
  const revisedSource = toFocus(change.revised);

  if (change.kind === "unchanged") {
    return {
      changeId: change.id,
      changeType: change.kind,
      severity: "low",
      significanceStatus: "skipped_unchanged",
      summary: "Provision is textually equivalent after safe whitespace normalization.",
      practicalEffect: null,
      changeSignals: [],
      confidence: "high",
      reviewReasons: [],
      originalSource,
      revisedSource,
      analysisMethod: "deterministic"
    };
  }

  const signals = detectChangeSignals(change);
  const rubric = applySeverityRubric({change, signals, coverage});
  const {summary, practicalEffect} = buildSummary(change, signals, rubric.severity);

  const significanceStatus =
    rubric.severity === "review_needed" ? "review_needed" : "analyzed";

  return {
    changeId: change.id,
    changeType: change.kind,
    severity: rubric.severity,
    significanceStatus,
    summary,
    practicalEffect,
    changeSignals: signals,
    confidence: rubric.confidence,
    reviewReasons: rubric.reviewReasons,
    originalSource,
    revisedSource,
    analysisMethod: "deterministic"
  };
}

function toFocus(
  block: ComparisonChange["original"]
): SourceFocus | null {
  if (!block) return null;
  return {
    documentId: block.documentId,
    startOffset: block.startOffset,
    endOffset: block.endOffset,
    pageIndices: block.pageIndices
  };
}

function buildSummary(
  change: ComparisonChange,
  signals: ChangeSignal[],
  severity: ChangeSignificance["severity"]
): {summary: string; practicalEffect: string | null} {
  const money = signals.find(s => s.kind === "monetary" && s.facts.direction !== "currency_mismatch");
  const duration = signals.find(s => s.kind === "duration");
  const negation = signals.find(s => s.kind === "negation");
  const modal = signals.find(s => s.kind === "modal");
  const party = signals.find(s => s.kind === "party");
  const jurisdiction = signals.find(s => s.kind === "jurisdiction");
  const percent = signals.find(s => s.kind === "percentage");
  const topicAdd = signals.find(
    s => s.kind === "topic" && (s.facts.presence === "added" || s.facts.presence === "removed")
  );

  if (money && money.facts.originalRaw && money.facts.revisedRaw) {
    const direction = String(money.facts.direction);
    const ratio = money.facts.ratio;
    let summary = `Monetary amount ${direction} from ${money.facts.originalRaw} to ${money.facts.revisedRaw}.`;
    if (typeof ratio === "number" && ratio > 0 && (direction === "increased" || direction === "decreased")) {
      summary += ` The revised amount is ${ratio}× the original.`;
    }
    const practicalEffect =
      severity === "review_needed"
        ? null
        : "This may alter the financial exposure associated with the provision; confirm impact for each party.";
    return {summary, practicalEffect};
  }

  if (duration && duration.facts.originalRaw && duration.facts.revisedRaw) {
    const direction = String(duration.facts.direction);
    return {
      summary: `Time period ${direction} from ${duration.facts.originalRaw} to ${duration.facts.revisedRaw}.`,
      practicalEffect:
        "This may change how far in advance a party must act (for example, to give notice)."
    };
  }

  if (negation) {
    return {
      summary: negation.detail,
      practicalEffect:
        "Permission or prohibition language changed; verify whether the action is now allowed or barred."
    };
  }

  if (modal) {
    return {
      summary: modal.detail,
      practicalEffect:
        "The strength of the obligation may have changed between mandatory and discretionary wording."
    };
  }

  if (party) {
    return {
      summary: party.detail,
      practicalEffect: "Confirm which party carries the revised obligation or right."
    };
  }

  if (jurisdiction) {
    return {
      summary: jurisdiction.detail,
      practicalEffect: "Dispute forum or governing law may differ; confirm with counsel if material."
    };
  }

  if (percent) {
    return {
      summary: percent.detail,
      practicalEffect: "Numeric percentage obligations or rates differ between versions."
    };
  }

  if (change.kind === "added") {
    const topic = topicAdd?.label?.replace(/_/g, " ");
    return {
      summary: topic
        ? `New provision appears in the revised readable text relating to ${topic}.`
        : "New provision appears in the revised readable text with no aligned original counterpart.",
      practicalEffect:
        "This may introduce new rights or duties; effect depends on surrounding clauses and is not automatically enforceable from this view alone."
    };
  }

  if (change.kind === "removed") {
    const topic = topicAdd?.label?.replace(/_/g, " ");
    return {
      summary: topic
        ? `Original provision relating to ${topic} has no aligned counterpart in the revised readable text.`
        : "Original provision has no aligned counterpart in the revised readable text.",
      practicalEffect:
        "The topic may still be addressed elsewhere; absence of an aligned block is not proof that the concept is eliminated from the whole contract."
    };
  }

  if (change.kind === "moved") {
    return {
      summary: "Near-identical provision relocated or renumbered between versions.",
      practicalEffect: null
    };
  }

  if (change.kind === "uncertain" || severity === "review_needed") {
    return {
      summary:
        "Alignment or interpretation is uncertain. Inspect the original and revised passages manually.",
      practicalEffect: null
    };
  }

  // Generic modified
  const label =
    change.original?.sectionLabel || change.revised?.sectionLabel
      ? ` (${change.original?.sectionLabel ?? change.revised?.sectionLabel})`
      : "";
  return {
    summary: `Corresponding provision${label} differs in wording between original and revised versions.`,
    practicalEffect:
      signals.length === 0
        ? "No high-priority numeric or modal signal was classified; review the paired text."
        : signals[0]!.detail
  };
}

function buildOverview(
  significances: ChangeSignificance[],
  coverageNotes: string[]
): ComparisonOverview {
  const changed = significances.filter(s => s.changeType !== "unchanged");
  const severityCounts: SeverityCounts = {
    high: 0,
    medium: 0,
    low: 0,
    review_needed: 0
  };
  for (const s of changed) {
    severityCounts[s.severity] += 1;
  }

  const highlightChangeIds = [...changed]
    .filter(s => s.severity === "high" || s.severity === "review_needed")
    .sort((a, b) => {
      const rank = (x: ChangeSignificance) =>
        x.severity === "high" ? 0 : x.severity === "review_needed" ? 1 : 2;
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return a.changeId.localeCompare(b.changeId);
    })
    .slice(0, 5)
    .map(s => s.changeId);

  const themeSet = new Set<string>();
  for (const s of changed) {
    for (const sig of s.changeSignals) {
      if (sig.kind === "topic") themeSet.add(String(sig.facts.topic ?? sig.label));
      if (sig.kind === "monetary") themeSet.add("monetary_amounts");
      if (sig.kind === "duration") themeSet.add("time_periods");
      if (sig.kind === "negation" || sig.kind === "modal") themeSet.add("obligation_language");
      if (sig.kind === "jurisdiction") themeSet.add("governing_law");
    }
  }

  const baseNotes = coverageNotes.filter(
    n =>
      !n.includes("Significance reflects transparent") &&
      !n.includes("do not replace legal advice")
  );

  const notes = [
    ...baseNotes,
    "Significance reflects transparent review signals, not a judicial or financial risk score.",
    "Explanations are party-neutral and do not replace legal advice."
  ];

  return {
    totalChanged: changed.length,
    severityCounts,
    highlightChangeIds,
    broadThemes: [...themeSet].sort(),
    notes
  };
}

/** Attach significances onto changes by id (mutates copies). */
export function mergeSignificances(
  result: ComparisonResult,
  significances: ChangeSignificance[],
  overview: ComparisonOverview,
  analysisMetrics: ComparisonResult["analysisMetrics"]
): ComparisonResult {
  const byId = new Map(significances.map(s => [s.changeId, s]));
  return {
    ...result,
    changes: result.changes.map(c => ({
      ...c,
      significance: byId.get(c.id) ?? null
    })),
    overview,
    analysisMetrics
  };
}
