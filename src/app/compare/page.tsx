"use client";

import Link from "next/link";
import {Suspense, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import VersionCompareLedger from "@/components/VersionCompareLedger";
import DocxCitationViewer, {type DocxViewerNavStatus} from "@/components/DocxCitationViewer";
import PdfCitationViewer, {type ViewerNavStatus} from "@/components/PdfCitationViewer";
import type {ComparisonResult, SourceFocus} from "@/lib/compare";

type LibraryDoc = {
  id: string;
  name: string;
  mime_type: string;
  status: string;
  page_count: number | null;
};

type SourcePayload = {
  document: {name: string; mime_type: string; page_count: number | null; unreadable_page_count: number};
  source: {text: string; pages: {pageIndex: number; start: number; end: number}[]};
};

function CompareVersionsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlOriginal = searchParams.get("original") ?? searchParams.get("old") ?? "";
  const urlRevised = searchParams.get("revised") ?? searchParams.get("new") ?? "";

  const [library, setLibrary] = useState<LibraryDoc[]>([]);
  const [originalId, setOriginalId] = useState(urlOriginal);
  const [revisedId, setRevisedId] = useState(urlRevised);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [focusRole, setFocusRole] = useState<"original" | "revised">("revised");
  const [focus, setFocus] = useState<SourceFocus | null>(null);
  const [sourceData, setSourceData] = useState<SourcePayload | null>(null);
  const [pdfStatus, setPdfStatus] = useState<ViewerNavStatus>({kind: "idle"});
  const [docxStatus, setDocxStatus] = useState<DocxViewerNavStatus>({kind: "idle"});
  const [sourceMode, setSourceMode] = useState<"pdf" | "docx" | "extracted">("extracted");
  const autoRan = useRef<string | null>(null);

  const readyDocs = useMemo(() => library.filter(d => d.status === "ready"), [library]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/documents", {cache: "no-store"});
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load library");
        setLibrary(payload.documents ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load library");
      }
    })();
  }, []);

  useEffect(() => {
    setOriginalId(urlOriginal);
    setRevisedId(urlRevised);
  }, [urlOriginal, urlRevised]);

  const loadSource = useCallback(async (id: string) => {
    setSourceData(null);
    const response = await fetch(`/api/documents/${id}/text`, {cache: "no-store"});
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load source");
    setSourceData(payload);
    if (payload.document.mime_type?.includes("pdf")) setSourceMode("pdf");
    else if (payload.document.mime_type?.includes("wordprocessingml")) setSourceMode("docx");
    else setSourceMode("extracted");
  }, []);

  useEffect(() => {
    if (!focus) return;
    void loadSource(focus.documentId).catch(e =>
      setError(e instanceof Error ? e.message : "Could not load source")
    );
  }, [focus, loadSource]);

  function syncUrl(nextOriginal: string, nextRevised: string) {
    const params = new URLSearchParams();
    if (nextOriginal) params.set("original", nextOriginal);
    if (nextRevised) params.set("revised", nextRevised);
    router.replace(`/compare?${params.toString()}`);
  }

  function swapRoles() {
    const nextO = revisedId;
    const nextR = originalId;
    setOriginalId(nextO);
    setRevisedId(nextR);
    setResult(null);
    setFocus(null);
    syncUrl(nextO, nextR);
  }

  async function runCompare(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setResult(null);
    setFocus(null);
    if (!originalId || !revisedId) {
      setError("Select both an original and a revised document.");
      return;
    }
    if (originalId === revisedId) {
      setError("Original and revised must be different documents.");
      return;
    }
    syncUrl(originalId, revisedId);
    setBusy(true);
    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({originalDocumentId: originalId, revisedDocumentId: revisedId})
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Comparison failed");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const key = `${urlOriginal}|${urlRevised}`;
    if (!urlOriginal || !urlRevised || urlOriginal === urlRevised) return;
    if (autoRan.current === key) return;
    if (!readyDocs.length) return;
    autoRan.current = key;
    void runCompare();
    // Auto-run once per URL pair after library is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOriginal, urlRevised, readyDocs.length]);

  function inspect(next: SourceFocus, role: "original" | "revised") {
    setFocusRole(role);
    setFocus(next);
  }

  const isPdf = Boolean(sourceData?.document.mime_type?.includes("pdf"));
  const isDocx = Boolean(sourceData?.document.mime_type?.includes("wordprocessingml"));
  const navBanner =
    sourceMode === "pdf"
      ? pdfStatus.kind === "highlighted"
        ? "Highlighted in PDF viewer."
        : pdfStatus.kind === "align_failed"
          ? pdfStatus.message
          : null
      : sourceMode === "docx"
        ? docxStatus.kind === "highlighted"
          ? "Highlighted in DOCX preview."
          : docxStatus.kind === "align_failed"
            ? docxStatus.message
            : null
        : null;

  const originalName = readyDocs.find(d => d.id === originalId)?.name ?? result?.original.name;
  const revisedName = readyDocs.find(d => d.id === revisedId)?.name ?? result?.revised.name;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <div className="brand-glyph" aria-hidden="true">
            P
          </div>
          <div>
            <strong>Pactrieve</strong>
            <span>Evidence workspace</span>
          </div>
        </Link>
        <div className="topbar-right">
          <Link className="button minimal" href="/">
            ← Library
          </Link>
        </div>
      </header>

      <main className="container inspector-container">
        <div className="eyebrow">COMPARE / VERSIONS</div>
        <div className="inspector-title">
          <div>
            <h1>Compare Versions</h1>
            <p>
              Align clauses and paragraphs between an earlier and later contract. This is structural
              textual comparison — not multi-document Q&amp;A and not legal-risk scoring.
            </p>
          </div>
        </div>

        <form className="compare-setup" onSubmit={e => void runCompare(e)}>
          <label>
            Original (earlier)
            <select
              value={originalId}
              onChange={e => {
                setOriginalId(e.target.value);
                setResult(null);
              }}
            >
              <option value="">Select document…</option>
              {readyDocs.map(d => (
                <option key={d.id} value={d.id} disabled={d.id === revisedId}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Revised (later)
            <select
              value={revisedId}
              onChange={e => {
                setRevisedId(e.target.value);
                setResult(null);
              }}
            >
              <option value="">Select document…</option>
              {readyDocs.map(d => (
                <option key={d.id} value={d.id} disabled={d.id === originalId}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <div className="compare-setup-actions">
            <button type="button" className="button subtle" onClick={swapRoles} disabled={!originalId && !revisedId}>
              Swap roles
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy || !originalId || !revisedId || originalId === revisedId}
            >
              {busy ? "Comparing…" : "Run comparison"}
            </button>
          </div>
        </form>

        {(originalName || revisedName) && (
          <div className="compare-version-labels">
            <span>
              Original: <b>{originalName ?? "—"}</b>
            </span>
            <span>
              Revised: <b>{revisedName ?? "—"}</b>
            </span>
          </div>
        )}

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {busy && (
          <div className="chat-live-status" role="status">
            Segmenting clauses and aligning versions…
          </div>
        )}

        {result && (
          <div className="compare-workspace">
            <VersionCompareLedger result={result} onInspect={inspect} />

            <aside className="compare-source-panel" aria-label="Source inspection">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">SOURCE · {focusRole.toUpperCase()}</div>
                  <h2>{sourceData?.document.name ?? "Select a passage"}</h2>
                </div>
              </div>
              {!focus && (
                <div className="empty">
                  Choose “Show in original/revised source” on a change to inspect the passage.
                </div>
              )}
              {focus && sourceData && (
                <>
                  <div className="source-mode-tabs" role="tablist">
                    {(isPdf || isDocx) && (
                      <button
                        type="button"
                        role="tab"
                        className={sourceMode === (isPdf ? "pdf" : "docx") ? "active" : ""}
                        onClick={() => setSourceMode(isPdf ? "pdf" : "docx")}
                      >
                        {isPdf ? "PDF viewer" : "DOCX preview"}
                      </button>
                    )}
                    <button
                      type="button"
                      role="tab"
                      className={sourceMode === "extracted" ? "active" : ""}
                      onClick={() => setSourceMode("extracted")}
                    >
                      Extracted text
                    </button>
                  </div>
                  {navBanner && (
                    <div className="status-banner" role="status">
                      {navBanner}
                    </div>
                  )}
                  {sourceMode === "pdf" && (
                    <PdfCitationViewer
                      documentId={focus.documentId}
                      pages={sourceData.source.pages}
                      sourceText={sourceData.source.text}
                      citation={focus}
                      onStatus={setPdfStatus}
                    />
                  )}
                  {sourceMode === "docx" && (
                    <DocxCitationViewer
                      documentId={focus.documentId}
                      canonicalText={sourceData.source.text}
                      citation={focus}
                      onStatus={setDocxStatus}
                      onAlignFailed={() => setSourceMode("extracted")}
                    />
                  )}
                  {sourceMode === "extracted" && (
                    <div className="source-preview extracted-preview">
                      {renderHighlighted(
                        sourceData.source.text,
                        focus.startOffset,
                        focus.endOffset
                      )}
                    </div>
                  )}
                </>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function renderHighlighted(text: string, start: number, end: number) {
  return (
    <>
      {text.slice(0, start)}
      <mark className="source-mark">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="empty">Loading version comparison…</div>}>
      <CompareVersionsInner />
    </Suspense>
  );
}
