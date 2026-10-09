"use client";

import type {ChangeKind, ComparisonChange, ComparisonResult, SourceFocus} from "@/lib/compare";

type Props = {
  result: ComparisonResult;
  onInspect: (focus: SourceFocus, role: "original" | "revised") => void;
};

const KIND_ORDER: ChangeKind[] = ["modified", "added", "removed", "moved", "uncertain", "unchanged"];

export default function VersionCompareLedger({result, onInspect}: Props) {
  const visible = result.changes.filter(c => c.kind !== "unchanged");
  const unchanged = result.summary.unchanged;

  return (
    <section className="compare-ledger" aria-label="Version comparison results">
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
          {unchanged} unchanged · {result.metrics.totalMs}ms · {result.coverage.originalBlockCount}/
          {result.coverage.revisedBlockCount} blocks
        </span>
      </div>

      {result.coverage.notes.length > 0 && (
        <div className="warning-banner" role="status">
          {result.coverage.notes.map((note, i) => (
            <div key={i}>{note}</div>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="empty">
          <b>No textual differences detected</b>
          <span>
            Compared material is equivalent after safe whitespace normalization ({unchanged} aligned
            blocks).
          </span>
        </div>
      ) : (
        <ol className="compare-change-list">
          {sortChanges(visible).map(change => (
            <li key={change.id} className={`compare-change kind-${change.kind}`}>
              <header>
                <span className={`change-kind-badge ${change.kind}`}>{labelFor(change.kind)}</span>
                <span className="change-confidence">{change.confidence} confidence</span>
                <span className="change-rationale">{change.rationale}</span>
              </header>
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
          ))}
        </ol>
      )}

      {unchanged > 0 && (
        <p className="minor-hint">
          {unchanged} unchanged block{unchanged === 1 ? "" : "s"} omitted from the ledger for
          readability.
        </p>
      )}
    </section>
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

function sortChanges(changes: ComparisonChange[]): ComparisonChange[] {
  return [...changes].sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind);
    const kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    const ao = a.original?.orderIndex ?? a.revised?.orderIndex ?? 0;
    const bo = b.original?.orderIndex ?? b.revised?.orderIndex ?? 0;
    return ao - bo;
  });
}
