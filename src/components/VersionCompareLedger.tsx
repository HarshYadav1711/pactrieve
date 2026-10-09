"use client";

import {useMemo, useState} from "react";
import type {ChangeKind, ComparisonChange, ComparisonResult, SourceFocus} from "@/lib/compare";
import {filterChanges, sortChanges} from "@/lib/compare/significance/sort-filter";
import type {SeverityFilter, SortMode} from "@/lib/compare/significance/types";

type Props = {
  result: ComparisonResult;
  onInspect: (focus: SourceFocus, role: "original" | "revised") => void;
};

const FILTERS: {id: SeverityFilter; label: string}[] = [
  {id: "changed", label: "All changes"},
  {id: "high", label: "High"},
  {id: "medium", label: "Medium"},
  {id: "low", label: "Low"},
  {id: "review_needed", label: "Review needed"},
  {id: "all", label: "Include unchanged"}
];

const SORTS: {id: SortMode; label: string}[] = [
  {id: "severity_desc", label: "Highest significance first"},
  {id: "severity_asc", label: "Lowest significance first"},
  {id: "document_order", label: "Document order"}
];

export default function VersionCompareLedger({result, onInspect}: Props) {
  const [filter, setFilter] = useState<SeverityFilter>("changed");
  const [sortMode, setSortMode] = useState<SortMode>("severity_desc");

  const visible = useMemo(() => {
    return sortChanges(filterChanges(result.changes, filter), sortMode);
  }, [result.changes, filter, sortMode]);

  const overview = result.overview;
  const unchanged = result.summary.unchanged;

  return (
    <section className="compare-ledger" aria-label="Version comparison results">
      <div className="compare-overview" role="region" aria-label="Comparison overview">
        <p className="compare-overview-lead">
          <b>{overview.totalChanged}</b>{" "}
          {overview.totalChanged === 1 ? "substantive change" : "substantive changes"} across
          aligned clauses
          {unchanged > 0 ? (
            <>
              {" "}
              · <span className="muted">{unchanged} unchanged omitted from default view</span>
            </>
          ) : null}
          .
        </p>
        <div className="compare-severity-counts" aria-label="Significance distribution">
          <span>
            <b>{overview.severityCounts.high}</b> high
          </span>
          <span>
            <b>{overview.severityCounts.medium}</b> medium
          </span>
          <span>
            <b>{overview.severityCounts.low}</b> low
          </span>
          <span>
            <b>{overview.severityCounts.review_needed}</b> review needed
          </span>
        </div>
        {overview.broadThemes.length > 0 && (
          <p className="compare-themes">
            Themes observed: {overview.broadThemes.map(t => t.replace(/_/g, " ")).join(" · ")}
          </p>
        )}
        {overview.highlightChangeIds.length > 0 && (
          <p className="compare-highlights muted">
            Priority attention: {overview.highlightChangeIds.join(", ")}
          </p>
        )}
        <p className="minor-hint">
          Significance is a transparent review signal, not a legal-risk score or counsel opinion.
          {result.analysisMetrics.enrichAttempted
            ? ` Model enrichment: ${result.analysisMetrics.enrichSucceeded} applied, ${result.analysisMetrics.enrichFailed} rejected/failed.`
            : " Deterministic analysis only (or enrichment not configured)."}
        </p>
      </div>

      <div className="compare-summary-bar" role="status">
        <span>
          <b>{result.summary.modified}</b> modified
        </span>
        <span>
          <b>{result.summary.added}</b> added
        </span>
        <span>
          <b>{result.summary.removed}</b> removed
        </span>
        <span>
          <b>{result.summary.moved}</b> moved
        </span>
        {result.summary.uncertain > 0 && (
          <span>
            <b>{result.summary.uncertain}</b> uncertain
          </span>
        )}
        <span className="muted">
          {result.metrics.totalMs}ms · analysis {result.analysisMetrics.deterministicMs}ms
          {result.analysisMetrics.enrichMs > 0 ? ` + enrich ${result.analysisMetrics.enrichMs}ms` : ""}
        </span>
      </div>

      {(result.coverage.notes.length > 0 || overview.notes.length > 0) && (
        <div className="warning-banner" role="status">
          {[...new Set([...result.coverage.notes, ...overview.notes])].map((note, i) => (
            <div key={i}>{note}</div>
          ))}
        </div>
      )}

      <div className="compare-controls">
        <div className="compare-filter-group" role="group" aria-label="Filter by significance">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={filter === f.id ? "filter-chip active" : "filter-chip"}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id !== "all" && f.id !== "changed" ? (
                <span className="filter-count">
                  {overview.severityCounts[f.id as keyof typeof overview.severityCounts] ?? 0}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <label className="compare-sort">
          Sort
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            aria-label="Sort comparison changes"
          >
            {SORTS.map(s => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="compare-visible-count muted" role="status">
        Showing {visible.length} of {result.changes.length} rows
        {filter !== "all" && filter !== "changed" ? ` (filter: ${filter.replace(/_/g, " ")})` : ""}.
      </p>

      {visible.length === 0 ? (
        <div className="empty">
          <b>No changes match this filter</b>
          <span>Choose “All changes” or another significance level to continue reviewing.</span>
        </div>
      ) : (
        <ol className="compare-change-list">
          {visible.map(change => (
            <ChangeRow key={change.id} change={change} onInspect={onInspect} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ChangeRow({
  change,
  onInspect
}: {
  change: ComparisonChange;
  onInspect: (focus: SourceFocus, role: "original" | "revised") => void;
}) {
  const sig = change.significance;
  return (
    <li
      className={`compare-change kind-${change.kind} severity-${sig?.severity ?? "low"}`}
      id={`change-${change.id}`}
    >
      <header>
        <span className={`change-kind-badge ${change.kind}`}>{labelFor(change.kind)}</span>
        {sig && (
          <span className={`severity-badge ${sig.severity}`} title="Suggested significance">
            {severityLabel(sig.severity)}
          </span>
        )}
        <span className="change-confidence">{change.confidence} alignment</span>
        {sig && (
          <span className="analysis-method muted">
            {sig.analysisMethod === "deterministic+llm"
              ? "Model-assisted (grounded)"
              : "Deterministic"}
          </span>
        )}
      </header>

      {sig && (
        <div className="change-analysis">
          <p className="change-summary">
            <b>What changed:</b> {sig.summary}
          </p>
          {sig.practicalEffect && (
            <p className="change-effect">
              <b>Review implication:</b> {sig.practicalEffect}
            </p>
          )}
          {sig.reviewReasons.length > 0 && (
            <ul className="change-reasons">
              {sig.reviewReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {sig.changeSignals.length > 0 && (
            <div className="change-signals" aria-label="Detected change signals">
              {sig.changeSignals.map((s, i) => (
                <span key={i} className="signal-chip">
                  {s.label.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="change-rationale muted">{change.rationale}</p>

      <div className="compare-pair">
        <article className="compare-side original">
          <h3>Original</h3>
          {change.original ? (
            <>
              {change.original.sectionLabel && (
                <div className="clause-label">{change.original.sectionLabel}</div>
              )}
              <pre className="clause-text">{change.original.text}</pre>
              <button
                type="button"
                className="button subtle"
                onClick={() =>
                  onInspect(
                    {
                      documentId: change.original!.documentId,
                      startOffset: change.original!.startOffset,
                      endOffset: change.original!.endOffset,
                      pageIndices: change.original!.pageIndices
                    },
                    "original"
                  )
                }
              >
                Show in original source
              </button>
            </>
          ) : (
            <p className="absent">No corresponding original block.</p>
          )}
        </article>
        <article className="compare-side revised">
          <h3>Revised</h3>
          {change.revised ? (
            <>
              {change.revised.sectionLabel && (
                <div className="clause-label">{change.revised.sectionLabel}</div>
              )}
              <pre className="clause-text">{change.revised.text}</pre>
              <button
                type="button"
                className="button subtle"
                onClick={() =>
                  onInspect(
                    {
                      documentId: change.revised!.documentId,
                      startOffset: change.revised!.startOffset,
                      endOffset: change.revised!.endOffset,
                      pageIndices: change.revised!.pageIndices
                    },
                    "revised"
                  )
                }
              >
                Show in revised source
              </button>
            </>
          ) : (
            <p className="absent">No corresponding revised block.</p>
          )}
        </article>
      </div>
    </li>
  );
}

function labelFor(kind: ChangeKind): string {
  switch (kind) {
    case "modified":
      return "Modified";
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    case "moved":
      return "Moved / renumbered";
    case "uncertain":
      return "Uncertain";
    default:
      return "Unchanged";
  }
}

function severityLabel(sev: string): string {
  switch (sev) {
    case "high":
      return "High significance";
    case "medium":
      return "Medium significance";
    case "low":
      return "Low significance";
    case "review_needed":
      return "Review needed";
    default:
      return sev;
  }
}
