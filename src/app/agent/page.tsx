"use client";

import Link from "next/link";
import {Suspense, useCallback, useEffect, useMemo, useState} from "react";
import {useSearchParams} from "next/navigation";
import AgentResearchChat from "@/components/AgentResearchChat";
import DocxCitationViewer, {type DocxViewerNavStatus} from "@/components/DocxCitationViewer";
import PdfCitationViewer, {type ViewerNavStatus} from "@/components/PdfCitationViewer";
import type {VerifiedCitation} from "@/lib/chat/types";
import {AGENT_LIMITS} from "@/lib/agent/limits";
import {normalizeDocumentIds} from "@/lib/chat/multi-ids";
import {pageIndicesForRange} from "@/lib/pdf";

type Source = {text: string; pages: {pageIndex: number; start: number; end: number}[]};
type DocPayload = {
  document: {
    id?: string;
    name: string;
    mime_type: string;
    page_count: number | null;
    unreadable_page_count: number;
    status?: string;
  };
  source: Source;
};

type LibraryDoc = {
  id: string;
  name: string;
  mime_type: string;
  status: string;
};

type SourceMode = "pdf" | "docx" | "extracted";

function AgentDeskInner() {
  const searchParams = useSearchParams();
  const rawIds = searchParams.get("docs") ?? "";
  const documentIds = useMemo(
    () =>
      normalizeDocumentIds(
        rawIds
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
      ),
    [rawIds]
  );

  const [library, setLibrary] = useState<LibraryDoc[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [docData, setDocData] = useState<DocPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<VerifiedCitation | null>(null);
  const [inspectRange, setInspectRange] = useState<{start: number; end: number} | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("extracted");
  const [pdfStatus, setPdfStatus] = useState<ViewerNavStatus>({kind: "idle"});
  const [docxStatus, setDocxStatus] = useState<DocxViewerNavStatus>({kind: "idle"});
  const [mobileTab, setMobileTab] = useState<"source" | "chat">("chat");

  const selectedDocs = useMemo(
    () => library.filter(d => documentIds.includes(d.id)),
    [library, documentIds]
  );
  const chatDocuments = useMemo(
    () => selectedDocs.map(d => ({id: d.id, name: d.name, mime_type: d.mime_type})),
    [selectedDocs]
  );

  useEffect(() => {
    void (async () => {
      setLibraryLoading(true);
      try {
        const response = await fetch("/api/documents", {cache: "no-store"});
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not load library");
        setLibrary(payload.documents ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load library");
      } finally {
        setLibraryLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!documentIds.length) return;
    if (!activeDocId || !documentIds.includes(activeDocId)) {
      setActiveDocId(documentIds[0]!);
    }
  }, [documentIds, activeDocId]);

  const loadDocument = useCallback(async (id: string) => {
    setError(null);
    setDocData(null);
    try {
      const response = await fetch(`/api/documents/${id}/text`, {cache: "no-store"});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load document");
      setDocData({...payload, document: {...payload.document, id}});
      if (payload.document.mime_type?.includes("pdf")) setSourceMode("pdf");
      else if (payload.document.mime_type?.includes("wordprocessingml")) setSourceMode("docx");
      else setSourceMode("extracted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load document");
    }
  }, []);

  useEffect(() => {
    if (activeDocId) void loadDocument(activeDocId);
  }, [activeDocId, loadDocument]);

  const isPdf = Boolean(docData?.document.mime_type?.includes("pdf"));
  const isDocx = Boolean(
    docData?.document.mime_type?.includes("wordprocessingml") ||
      docData?.document.mime_type?.includes("docx")
  );

  function inspectCitation(citation: VerifiedCitation) {
    if (!documentIds.includes(citation.documentId)) {
      setError("That citation belongs to a document outside this selection.");
      return;
    }
    setActiveDocId(citation.documentId);
    setActiveCitation(citation);
    setInspectRange({start: citation.startOffset, end: citation.endOffset});
    setMobileTab("source");
    // Source mode is set after loadDocument; also hint preferred mode from library mime.
    const meta = library.find(d => d.id === citation.documentId);
    if (meta?.mime_type.includes("pdf")) setSourceMode("pdf");
    else if (meta?.mime_type.includes("wordprocessingml")) setSourceMode("docx");
  }

  useEffect(() => {
    if (!activeCitation || !docData || activeCitation.documentId !== activeDocId) return;
    if (activeCitation.pageIndices.length === 0) {
      const pageIndices = pageIndicesForRange(
        docData.source.pages,
        activeCitation.startOffset,
        activeCitation.endOffset
      );
      if (pageIndices.length) {
        setActiveCitation(prev => (prev ? {...prev, pageIndices} : prev));
      }
    }
    setSourceMode(prev => {
      if (isPdf && prev !== "pdf") return "pdf";
      if (isDocx && prev !== "docx") return "docx";
      return prev;
    });
  }, [docData, activeDocId, activeCitation, isPdf, isDocx]);

  const missingIds = documentIds.filter(id => !library.some(d => d.id === id));
  const selectionValid =
    !libraryLoading &&
    documentIds.length >= AGENT_LIMITS.minDocuments &&
    documentIds.length <= AGENT_LIMITS.maxDocuments &&
    missingIds.length === 0 &&
    selectedDocs.length === documentIds.length &&
    selectedDocs.every(d => d.status === "ready");

  const highlightStart = inspectRange?.start ?? activeCitation?.startOffset;
  const highlightEnd = inspectRange?.end ?? activeCitation?.endOffset;
  const hasHighlight =
    highlightStart !== undefined && highlightEnd !== undefined && docData && activeDocId;

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
        <div className="eyebrow">AGENT / RESEARCH</div>
        <div className="inspector-title">
          <div>
            <h1>Agent Research</h1>
            <p>
              Multi-step tool-using investigation across selected contracts. Distinct from Ask
              Documents Q&amp;A and Compare Versions.
            </p>
          </div>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        {libraryLoading && <div className="empty" role="status">Loading selected documents…</div>}

        {!libraryLoading && !selectionValid && (
          <div className="warning-banner" role="status">
            Select {AGENT_LIMITS.minDocuments}–{AGENT_LIMITS.maxDocuments} ready documents from the library for agent research.
            {missingIds.length
              ? ` Missing or unavailable: ${missingIds.map(id => id.slice(0, 8)).join(", ")}.`
              : selectedDocs.some(d => d.status !== "ready")
                ? " One or more selected documents are not ready."
                : ""}
            <div style={{marginTop: 12}}>
              <Link className="button subtle" href="/">
                Return to library
              </Link>
            </div>
          </div>
        )}

        {selectionValid && (
          <>
            <div className="mobile-tabs" role="tablist" aria-label="Research panels">
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === "source"}
                className={mobileTab === "source" ? "active" : ""}
                onClick={() => setMobileTab("source")}
              >
                Source
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileTab === "chat"}
                className={mobileTab === "chat" ? "active" : ""}
                onClick={() => setMobileTab("chat")}
              >
                Agent
              </button>
            </div>

            <div className={`inspector-grid ${mobileTab === "source" ? "show-source" : "show-chat"}`}>
              <section className="source-panel" aria-label="Source document">
                <div className="section-heading">
                  <div>
                    <div className="eyebrow">SOURCE</div>
                    <h2>{docData?.document.name ?? "Loading…"}</h2>
                  </div>
                  {activeDocId && (
                    <button
                      type="button"
                      className="button subtle"
                      onClick={() =>
                        window.open(
                          `/api/documents/${activeDocId}/file?redirect=1`,
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      Open original
                    </button>
                  )}
                </div>

                <div className="research-doc-switch" role="tablist" aria-label="Focus document">
                  {selectedDocs.map(doc => (
                    <button
                      key={doc.id}
                      type="button"
                      role="tab"
                      aria-selected={activeDocId === doc.id}
                      className={activeDocId === doc.id ? "active" : ""}
                      onClick={() => {
                        setActiveDocId(doc.id);
                        setActiveCitation(null);
                        setInspectRange(null);
                      }}
                    >
                      {doc.mime_type.includes("pdf") ? "PDF" : "DOC"} · {doc.name}
                    </button>
                  ))}
                </div>

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

                {!docData && <div className="empty">Loading source…</div>}

                {docData && sourceMode === "pdf" && activeDocId && (
                  <PdfCitationViewer
                    documentId={activeDocId}
                    pages={docData.source.pages}
                    sourceText={docData.source.text}
                    citation={
                      activeCitation?.documentId === activeDocId ? activeCitation : null
                    }
                    onStatus={setPdfStatus}
                  />
                )}

                {docData && sourceMode === "docx" && activeDocId && (
                  <DocxCitationViewer
                    documentId={activeDocId}
                    canonicalText={docData.source.text}
                    citation={
                      activeCitation?.documentId === activeDocId ? activeCitation : null
                    }
                    onStatus={setDocxStatus}
                    onAlignFailed={cite => {
                      setInspectRange({start: cite.startOffset, end: cite.endOffset});
                      setSourceMode("extracted");
                    }}
                  />
                )}

                {docData && sourceMode === "extracted" && (
                  <div className="source-preview extracted-preview">
                    {hasHighlight
                      ? renderHighlighted(docData.source.text, highlightStart!, highlightEnd!)
                      : docData.source.text}
                  </div>
                )}
              </section>

              <AgentResearchChat
                documents={chatDocuments}
                onInspectCitation={inspectCitation}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function renderHighlighted(text: string, start: number, end: number) {
  const before = text.slice(0, start);
  const mid = text.slice(start, end);
  const after = text.slice(end);
  return (
    <>
      {before}
      <mark className="source-mark">{mid}</mark>
      {after}
    </>
  );
}

export default function AgentPage() {
  return (
    <Suspense fallback={<div className="empty">Loading agent research…</div>}>
      <AgentDeskInner />
    </Suspense>
  );
}
