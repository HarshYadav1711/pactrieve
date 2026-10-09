"use client";
import Link from "next/link";
import {useCallback, useEffect, useRef, useState} from "react";
import {useParams} from "next/navigation";
import DocumentChat from "@/components/DocumentChat";
import PdfCitationViewer, {type ViewerNavStatus} from "@/components/PdfCitationViewer";
import type {VerifiedCitation} from "@/lib/chat/types";
import {pageIndicesForRange} from "@/lib/pdf";

type Source = {text: string; pages: {pageIndex:number;start:number;end:number}[]};
type Occurrence = {start:number;end:number;pageIndices:number[];exactSourceText:string;occurrenceIndex:number};
type VerifyResponse = {verified:boolean;occurrences:Occurrence[];reason?:string};
type DocumentData = {
  document:{name:string;mime_type:string;page_count:number|null;unreadable_page_count:number;status?:string};
  source:Source
};

export default function DocumentInspector() {
  const {id} = useParams<{id:string}>();
  const [data,setData] = useState<DocumentData|null>(null);
  const [error,setError] = useState<string|null>(null);
  const [quote,setQuote] = useState("");
  const [checking,setChecking] = useState(false);
  const [verification,setVerification] = useState<VerifyResponse|null>(null);
  const [selected,setSelected] = useState(0);
  const [inspectRange,setInspectRange] = useState<{start:number;end:number}|null>(null);
  const [activeCitation,setActiveCitation] = useState<VerifiedCitation|null>(null);
  const [viewerStatus,setViewerStatus] = useState<ViewerNavStatus>({kind:"idle"});
  const [sourceMode,setSourceMode] = useState<"pdf"|"extracted">("pdf");
  const [mobileTab,setMobileTab] = useState<"source"|"chat">("chat");
  const highlight = useRef<HTMLElement|null>(null);

  const isPdf = Boolean(data?.document.mime_type?.includes("pdf"));

  const load = useCallback(async() => {
    try {
      const response=await fetch(`/api/documents/${id}/text`,{cache:"no-store"});
      const payload=await response.json();
      if(!response.ok) throw new Error(payload.error);
      setData(payload);
      if (!payload.document.mime_type?.includes("pdf")) setSourceMode("extracted");
    } catch(e) {setError(e instanceof Error?e.message:"Could not load document");}
  },[id]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{highlight.current?.scrollIntoView({behavior:"smooth",block:"center"});},[verification,selected,inspectRange]);

  async function verify(e:React.FormEvent) {
    e.preventDefault();setChecking(true);setError(null);setVerification(null);setSelected(0);setInspectRange(null);setActiveCitation(null);
    try {
      const response=await fetch(`/api/documents/${id}/verify`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({quote})});
      const payload=await response.json();
      if(!response.ok) throw new Error(payload.error);
      setVerification(payload);
    } catch(e){setError(e instanceof Error?e.message:"Quote check failed");}
    finally {setChecking(false);}
  }

  function openOriginal() {
    window.open(`/api/documents/${id}/file?redirect=1`,"_blank","noopener,noreferrer");
  }

  function enrichCitation(citation: VerifiedCitation): VerifiedCitation {
    if (!data) return citation;
    if (citation.documentId !== id) return citation;
    const pageIndices =
      citation.pageIndices.length > 0
        ? citation.pageIndices
        : pageIndicesForRange(data.source.pages, citation.startOffset, citation.endOffset);
    return {...citation, pageIndices};
  }

  function inspectCitation(citation: VerifiedCitation) {
    const enriched = enrichCitation(citation);
    if (enriched.documentId !== id) {
      setError("That citation belongs to a different document.");
      return;
    }
    setVerification(null);
    setInspectRange({start: enriched.startOffset, end: enriched.endOffset});
    setActiveCitation(enriched);
    if (isPdf) setSourceMode("pdf");
    setMobileTab("source");
  }

  function inspectOccurrence(occurrence: Occurrence) {
    setInspectRange({start: occurrence.start, end: occurrence.end});
    if (data && isPdf) {
      setActiveCitation({
        evidenceId: `manual-${occurrence.occurrenceIndex}`,
        documentId: id,
        quote: occurrence.exactSourceText,
        startOffset: occurrence.start,
        endOffset: occurrence.end,
        pageIndices: occurrence.pageIndices,
        sectionLabel: null,
        occurrenceIndex: occurrence.occurrenceIndex,
        verified: true
      });
      setSourceMode("pdf");
    }
  }

  const occurrence=verification?.verified ? verification.occurrences[selected] : undefined;
  const highlightStart = occurrence?.start ?? inspectRange?.start;
  const highlightEnd = occurrence?.end ?? inspectRange?.end;
  const hasHighlight = highlightStart !== undefined && highlightEnd !== undefined && data;

  useEffect(() => {
    if (occurrence && isPdf) inspectOccurrence(occurrence);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occurrence?.occurrenceIndex, occurrence?.start, occurrence?.end, isPdf]);

  return <div className="app-shell inspector-shell">
    <header className="topbar"><Link className="brand" href="/"><div className="brand-glyph">P</div><div><strong>Pactrieve</strong><span>Evidence workspace</span></div></Link>
    <div className="topbar-right"><Link href="/" className="return-link">← Back to library</Link></div></header>
    <main className="container inspector-container">
      <div className="eyebrow">DOCUMENTS / RESEARCH DESK</div>
      <div className="inspector-title"><div><h1>{data?.document.name ?? "Loading contract…"}</h1>
        <p>Ask grounded questions and inspect independently verified source quotations.</p></div>
        {data && <button className="button subtle" onClick={openOriginal}>Open original ↗</button>}</div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {data?.document.unreadable_page_count ? <div className="error-banner">Warning: {data.document.unreadable_page_count} pages yielded no text. Absence claims may be incomplete.</div> : null}

      <div className="mobile-tabs" role="tablist" aria-label="Document panels">
        <button type="button" role="tab" aria-selected={mobileTab==="source"} className={mobileTab==="source"?"active":""} onClick={()=>setMobileTab("source")}>Source</button>
        <button type="button" role="tab" aria-selected={mobileTab==="chat"} className={mobileTab==="chat"?"active":""} onClick={()=>setMobileTab("chat")}>Chat</button>
      </div>

      <div className="inspector-grid desk-grid">
        <section className={`reader-card ${mobileTab==="source"?"":"mobile-hidden"}`}>
          <div className="reader-heading">
            <b>{isPdf ? "Original PDF" : "Extracted source"}</b>
            <span>{data?.document.page_count ? `${data.document.page_count} PDF pages` : "Semantic DOCX text"}</span>
          </div>

          {isPdf && (
            <div className="source-mode-tabs" role="tablist" aria-label="Source view">
              <button type="button" role="tab" aria-selected={sourceMode==="pdf"} className={sourceMode==="pdf"?"active":""} onClick={()=>setSourceMode("pdf")}>PDF viewer</button>
              <button type="button" role="tab" aria-selected={sourceMode==="extracted"} className={sourceMode==="extracted"?"active":""} onClick={()=>setSourceMode("extracted")}>Extracted text</button>
            </div>
          )}

          {viewerStatus.kind === "align_failed" && sourceMode === "pdf" && (
            <div className="warning-banner" role="status">
              {viewerStatus.message}
              {viewerStatus.fallbackPage != null ? ` Showing page ${viewerStatus.fallbackPage}.` : ""}
            </div>
          )}
          {viewerStatus.kind === "highlighted" && sourceMode === "pdf" && (
            <div className="status-banner" role="status">
              Highlighted on page{viewerStatus.pages.length > 1 ? "s" : ""} {viewerStatus.pages.join(", ")}.
            </div>
          )}

          {!data ? <div className="empty">Loading extracted source…</div> :
            isPdf && sourceMode === "pdf" ? (
              <PdfCitationViewer
                documentId={id}
                pages={data.source.pages}
                sourceText={data.source.text}
                citation={activeCitation}
                onStatus={setViewerStatus}
              />
            ) : (
              <pre className="source-preview">{hasHighlight ? <>{data.source.text.slice(0,highlightStart)}<mark ref={highlight}>{data.source.text.slice(highlightStart,highlightEnd)}</mark>{data.source.text.slice(highlightEnd)}</> : data.source.text}</pre>
            )}

          {!isPdf && data && (
            <p className="muted-note">DOCX original-layout highlighting is Phase 6. Extracted text navigation remains available.</p>
          )}
        </section>

        <aside className={`analysis-column ${mobileTab==="chat"?"":"mobile-hidden"}`}>
          {data && (
            <DocumentChat
              documentId={id}
              documentName={data.document.name}
              onInspectCitation={inspectCitation}
            />
          )}
          {!data && !error && <div className="chat-panel"><div className="empty">Loading chat…</div></div>}

          <details className="evidence-lab">
            <summary>Manual quotation check</summary>
            <div className="evidence-panel nested">
              <div className="eyebrow">EVIDENCE LAB / DETERMINISTIC CHECK</div>
              <h2>Verify a quotation</h2>
              <p>Paste a precise passage from the contract. Pactrieve locates it in stored source text without asking an LLM to guess.</p>
              <form onSubmit={e=>void verify(e)}>
                <label htmlFor="quote">Proposed source quotation</label>
                <textarea id="quote" rows={5} value={quote} onChange={e=>setQuote(e.target.value)} placeholder="Paste quoted contract language…"/>
                <button disabled={checking || quote.trim().length===0} className="button primary" type="submit">{checking?"Checking…":"Verify against document"}</button>
              </form>
              {verification && <div className={`verification-result ${verification.verified?"good":"bad"}`} role="status">
                <b>{verification.verified?"✓ Quote verified":"× Quote not found"}</b>
                <p>{verification.verified?`${verification.occurrences.length} exact source occurrence(s), allowing whitespace variation.`:"This wording is not present in the stored source. It cannot be presented as a genuine citation."}</p>
                {verification.verified && verification.occurrences.length>1 && <label>Occurrences <select value={selected} onChange={e=>setSelected(Number(e.target.value))}>
                  {verification.occurrences.map(item=><option key={item.occurrenceIndex} value={item.occurrenceIndex}>Occurrence {item.occurrenceIndex+1}</option>)}</select></label>}
                {occurrence && <small>Source offsets {occurrence.start}–{occurrence.end} · Text page(s): {occurrence.pageIndices.map(i=>i+1).join(", ")}</small>}
                {occurrence && isPdf && (
                  <button type="button" className="button subtle" style={{marginTop:8}} onClick={()=>inspectOccurrence(occurrence)}>
                    Show in PDF viewer
                  </button>
                )}
              </div>}
            </div>
          </details>
        </aside>
      </div>
    </main>
  </div>;
}
