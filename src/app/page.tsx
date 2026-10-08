"use client";

import Link from "next/link";
import {useCallback, useEffect, useRef, useState} from "react";
import {createClient} from "@supabase/supabase-js";

type DocumentRecord = {
  id: string; name: string; mime_type: string; size_bytes: number; status: string;
  error_message: string | null; page_count: number | null; unreadable_page_count: number;
  created_at: string;
};

function getError(value: unknown): string {
  return value instanceof Error ? value.message : "An unexpected error occurred.";
}
function getMime(name: string) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.docx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}
function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(.01, bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function LibraryHome() {
  const picker = useRef<HTMLInputElement>(null);
  const [documents,setDocuments] = useState<DocumentRecord[]>([]);
  const [loading,setLoading] = useState(true);
  const [uploading,setUploading] = useState(false);
  const [activeName,setActiveName] = useState("");
  const [dragged,setDragged] = useState(false);
  const [error,setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/documents", {cache: "no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not fetch documents");
      setDocuments(data.documents);
    } catch(e) { setError(getError(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!documents.some(d => d.status === "processing")) return;
    const interval = setInterval(() => void refresh(), 1500);
    return () => clearInterval(interval);
  }, [documents,refresh]);

  async function uploadFile(file?: File) {
    if (!file || uploading) return;
    const mime = getMime(file.name);
    if (!mime) { setError("Only PDF and DOCX files are supported."); return; }
    if (!file.size || file.size > 30 * 1024 * 1024) {
      setError("Choose a non-empty file smaller than 30 MB."); return;
    }
    setUploading(true); setActiveName(file.name); setError(null);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Supabase public environment variables are not configured.");
      const initiated = await fetch("/api/documents/initiate", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({name:file.name,mimeType:mime,sizeBytes:file.size})});
      const init = await initiated.json();
      if (!initiated.ok) throw new Error(init.error || "Could not initialize upload");
      await refresh();
      const storage = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
      const {error:uploadError} = await storage.from(init.bucket)
        .uploadToSignedUrl(init.uploadPath,init.uploadToken,file,{contentType:mime});
      if (uploadError) throw new Error(uploadError.message);
      const processing = await fetch(`/api/documents/${init.documentId}/process`,{method:"POST"});
      const result = await processing.json();
      if (!processing.ok) throw new Error(result.error || "Processing failed");
      await refresh();
    } catch(e) {setError(getError(e)); await refresh();}
    finally {setUploading(false);setActiveName("");}
  }

  async function deleteDocument(id: string) {
    if (!window.confirm("Delete this contract and its extracted evidence?")) return;
    const response = await fetch(`/api/documents/${id}`,{method:"DELETE"});
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error || "Could not delete document");
    } else await refresh();
  }

  const ready = documents.filter(d => d.status === "ready").length;
  const hasProblems = documents.some(d=>d.status === "failed");
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-glyph" aria-hidden="true">P</div><div>
        <strong>Pactrieve</strong><span>Every answer, traceable.</span>
      </div></div>
      <div className="topbar-right"><span className="beta">FOUNDATION BUILD · 01</span><span className="top-dot"/> Workspace</div>
    </header>
    <main className="container">
      <div className="eyebrow">DOCUMENT INTELLIGENCE / LIBRARY</div>
      <section className="intro"><div><h1>Your contracts, under scrutiny.</h1>
        <p>Collect agreements and inspect extracted evidence before AI enters the equation.</p></div>
        <div className="summary-number"><b>{String(ready).padStart(2,"0")}</b><span>READY TO INSPECT</span></div>
      </section>
      <div className="layout-grid"><div className="main-stack">
        <section className={`upload-area ${dragged?"is-dragged":""}`} onDragOver={e=>{e.preventDefault();setDragged(true);}}
          onDragLeave={()=>setDragged(false)} onDrop={e=>{e.preventDefault();setDragged(false);void uploadFile(e.dataTransfer.files[0]);}}>
          <div className="upload-icon">↑</div><h2>{uploading ? "Processing your contract" : "Introduce a new document"}</h2>
          <p>{uploading ? activeName : "Drop a PDF or Word document here, or select a file to begin."}</p>
          <input ref={picker} hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={e=>{void uploadFile(e.currentTarget.files?.[0]);e.currentTarget.value="";}}/>
          <button disabled={uploading} className="button primary" onClick={()=>picker.current?.click()}>
            {uploading ? "Working…" : "Choose document"}<span aria-hidden="true">↗</span>
          </button><small>PDF or DOCX · Up to 30 MB · Original stored privately</small>
        </section>
        {error && <div className="error-banner" role="alert"><b>Action needed:</b> {error}</div>}
        <section className="library-section"><div className="section-heading"><div><div className="eyebrow">WORKSPACE / FILES</div>
          <h2>Document library <span className="count">{documents.length}</span></h2></div><button className="button minimal" onClick={()=>void refresh()}>↻ Refresh</button></div>
          {loading ? <div className="empty">Loading stored documents…</div> : documents.length===0 ?
            <div className="empty"><div className="empty-icon">▤</div><b>Nothing to review yet</b>
              <span>Your uploaded contracts will appear here, ready for evidence inspection.</span></div> :
            <div className="document-list">{documents.map(doc=><article key={doc.id} className="document-row">
              <div className="doc-icon">{doc.mime_type === "application/pdf" ? "PDF" : "DOC"}</div>
              <div className="document-info"><b>{doc.name}</b>
                <span>{sizeLabel(doc.size_bytes)} <span className="separator">·</span> {new Date(doc.created_at).toLocaleDateString()}
                  {doc.page_count ? ` · ${doc.page_count} pages` : ""}</span>
                {doc.unreadable_page_count > 0 && <span className="warning-text">{doc.unreadable_page_count} pages without extracted text</span>}
                {doc.error_message && <span className="warning-text">{doc.error_message}</span>}</div>
              <span className={`status ${doc.status}`}>{doc.status}</span>
              {doc.status==="ready" && <Link className="button subtle" href={`/documents/${doc.id}`}>Inspect ↗</Link>}
              <button className="button minimal delete" onClick={()=>void deleteDocument(doc.id)} aria-label={`Delete ${doc.name}`}>×</button>
            </article>)}</div>}
          {hasProblems && <p className="minor-hint">Failed uploads can be removed and replaced with corrected files.</p>}
        </section>
      </div>
      <aside className="sidebar"><div className="sidebar-label">THE PACTRIEVE STANDARD</div>
        <h3>Evidence first.<br/>Answers second.</h3><p>Every quotation must match the underlying extracted source. Document text is the record; the model is not.</p>
        <div className="principle"><span>01</span><div><b>Immutable source offsets</b><p>Every extracted segment retains its original document position.</p></div></div>
        <div className="principle"><span>02</span><div><b>Deterministic verification</b><p>Quotes are matched against source text, with whitespace normalization.</p></div></div>
        <div className="principle"><span>03</span><div><b>Explicit uncertainty</b><p>Missing and unreadable content is reported rather than invented.</p></div></div>
        <div className="sidebar-note">CURRENT PHASE<br/><strong>Ingestion + evidence verification</strong><small>AI chat, comparison and page-overlay citations follow in later phases.</small></div>
      </aside></div>
    </main><footer className="footer">PACTRIEVE · ENGINEERING ASSESSMENT <span>Document insights are not legal advice.</span></footer>
  </div>;
}
