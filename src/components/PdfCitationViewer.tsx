"use client";

import {useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject} from "react";
import type {PageBoundary} from "@/lib/evidence/verify";
import type {SourceFocus} from "@/lib/compare/types";
import {
  locateCitationOnPdf,
  pageIndicesForRange,
  reconstructPageWithMap,
  type LocatedPageHighlight,
  type ReconstructedPageMap
} from "@/lib/pdf";
import {measureItemSpanRects, type OverlayRect} from "@/lib/pdf/dom-highlight";

type PdfjsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

export type ViewerNavStatus =
  | {kind: "idle"}
  | {kind: "loading"}
  | {kind: "ready"}
  | {kind: "error"; message: string}
  | {kind: "highlighting"}
  | {
      kind: "highlighted";
      pages: number[];
      quotePreview: string;
    }
  | {
      kind: "align_failed";
      message: string;
      fallbackPage: number | null;
      technical?: string;
    };

type Props = {
  documentId: string;
  pages: PageBoundary[];
  sourceText: string;
  /** Verified citation or comparison source focus — offsets must be source-derived. */
  citation: SourceFocus | null;
  onStatus?: (status: ViewerNavStatus) => void;
};

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;
const SCALE_STEP = 0.15;
const PAGE_WINDOW = 1;

export default function PdfCitationViewer({documentId, pages, sourceText, citation, onStatus}: Props) {
  const [status, setStatus] = useState<ViewerNavStatus>({kind: "loading"});
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [currentPage, setCurrentPage] = useState(1);
  const [visiblePages, setVisiblePages] = useState<number[]>([1]);
  const [overlays, setOverlays] = useState<Record<number, OverlayRect[]>>({});
  const [activeHighlights, setActiveHighlights] = useState<LocatedPageHighlight[]>([]);
  const [alignNotice, setAlignNotice] = useState<string | null>(null);

  const pdfRef = useRef<PdfDocument | null>(null);
  const pdfjsRef = useRef<PdfjsModule | null>(null);
  const pageMapsRef = useRef<Map<number, ReconstructedPageMap>>(new Map());
  const textDivsRef = useRef<Map<number, HTMLElement[]>>(new Map());
  const pageElsRef = useRef<Map<number, HTMLElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const renderGenRef = useRef(0);
  const containerWidthRef = useRef<number>(720);

  const canonicalPageText = useMemo(() => {
    const map = new Map<number, string>();
    for (const page of pages) {
      map.set(page.pageIndex, sourceText.slice(page.start, page.end));
    }
    return map;
  }, [pages, sourceText]);

  const report = useCallback(
    (next: ViewerNavStatus) => {
      setStatus(next);
      onStatus?.(next);
    },
    [onStatus]
  );

  // Load PDF document once per documentId.
  useEffect(() => {
    let cancelled = false;
    pageMapsRef.current.clear();
    textDivsRef.current.clear();
    setOverlays({});
    setActiveHighlights([]);
    setAlignNotice(null);
    report({kind: "loading"});

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        pdfjsRef.current = pdfjs;
        const loadingTask = pdfjs.getDocument({
          url: `/api/documents/${documentId}/file?raw=1`,
          useSystemFonts: true
        });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setVisiblePages(buildWindow(1, pdf.numPages, []));
        report({kind: "ready"});
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not load the original PDF.";
        report({kind: "error", message});
      }
    })();

    return () => {
      cancelled = true;
      const doc = pdfRef.current;
      pdfRef.current = null;
      void doc?.destroy();
    };
  }, [documentId, report]);

  // Recompute visible window when page / citation pages change.
  useEffect(() => {
    if (!numPages) return;
    const citePages = activeHighlights.map(h => h.pageIndex + 1);
    setVisiblePages(buildWindow(currentPage, numPages, citePages));
  }, [currentPage, numPages, activeHighlights]);

  // Remeasure overlays after zoom / resize when highlights are active.
  useEffect(() => {
    if (!activeHighlights.length) return;
    const id = requestAnimationFrame(() => {
      const next: Record<number, OverlayRect[]> = {};
      for (const hl of activeHighlights) {
        const pageEl = pageElsRef.current.get(hl.pageIndex);
        const divs = textDivsRef.current.get(hl.pageIndex);
        if (!pageEl || !divs) continue;
        next[hl.pageIndex] = measureItemSpanRects(pageEl, divs, hl.itemSpans);
      }
      setOverlays(next);
    });
    return () => cancelAnimationFrame(id);
  }, [scale, activeHighlights, visiblePages]);

  // ResizeObserver for container width → remeasure
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (Math.abs(width - containerWidthRef.current) < 2) return;
      containerWidthRef.current = width;
      setOverlays(prev => {
        if (!Object.keys(prev).length) return prev;
        const next: Record<number, OverlayRect[]> = {};
        for (const hl of activeHighlights) {
          const pageEl = pageElsRef.current.get(hl.pageIndex);
          const divs = textDivsRef.current.get(hl.pageIndex);
          if (!pageEl || !divs) continue;
          next[hl.pageIndex] = measureItemSpanRects(pageEl, divs, hl.itemSpans);
        }
        return next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeHighlights]);

  const ensurePageMap = useCallback(async (pageIndex: number): Promise<ReconstructedPageMap | null> => {
    const cached = pageMapsRef.current.get(pageIndex);
    if (cached) return cached;
    const pdf = pdfRef.current;
    if (!pdf) return null;
    const page = await pdf.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    const map = reconstructPageWithMap(content.items as object[]);
    pageMapsRef.current.set(pageIndex, map);
    return map;
  }, []);

  const navigateCitation = useCallback(
    async (cite: SourceFocus) => {
      if (!pdfRef.current) return;
      report({kind: "highlighting"});
      setAlignNotice(null);
      setOverlays({});
      setActiveHighlights([]);

      const derivedPages =
        cite.pageIndices && cite.pageIndices.length > 0
          ? cite.pageIndices
          : pageIndicesForRange(pages, cite.startOffset, cite.endOffset);

      // Prefetch text maps for affected pages before locating.
      const pageMaps = new Map<number, ReconstructedPageMap>();
      for (const pageIndex of derivedPages.length ? derivedPages : [0]) {
        const map = await ensurePageMap(pageIndex);
        if (map) pageMaps.set(pageIndex, map);
      }

      const located = locateCitationOnPdf({
        documentId,
        citationDocumentId: cite.documentId,
        startOffset: cite.startOffset,
        endOffset: cite.endOffset,
        pages,
        canonicalPageText,
        pageMaps
      });

      if (!located.ok) {
        const fallback =
          located.fallbackPageIndex != null
            ? located.fallbackPageIndex
            : derivedPages[0] ?? null;
        if (fallback != null) {
          setCurrentPage(fallback + 1);
          setVisiblePages(buildWindow(fallback + 1, numPages || pdfRef.current.numPages, [fallback + 1]));
        }
        const message =
          located.reason === "WRONG_DOCUMENT"
            ? "This citation belongs to a different document."
            : "Verified source located, but precise visual highlighting is unavailable for this passage.";
        setAlignNotice(message);
        report({
          kind: "align_failed",
          message,
          fallbackPage: fallback != null ? fallback + 1 : null,
          technical: [located.reason, located.alignReason, located.detail].filter(Boolean).join(" · ")
        });
        return;
      }

      setActiveHighlights(located.pages);
      setCurrentPage(located.focusPageIndex + 1);
      setVisiblePages(
        buildWindow(
          located.focusPageIndex + 1,
          numPages || pdfRef.current.numPages,
          located.pages.map(p => p.pageIndex + 1)
        )
      );

      // Wait for page renders (text layers) then measure.
      await waitForFrames(2);
      const nextOverlays: Record<number, OverlayRect[]> = {};
      for (const hl of located.pages) {
        // Ensure map + wait until text divs exist (page component registers them).
        await ensurePageMap(hl.pageIndex);
        const ready = await waitUntil(
          () => {
            const divs = textDivsRef.current.get(hl.pageIndex);
            const pageEl = pageElsRef.current.get(hl.pageIndex);
            return Boolean(divs && pageEl && divs.length > 0);
          },
          4000
        );
        if (!ready) continue;
        const pageEl = pageElsRef.current.get(hl.pageIndex)!;
        const divs = textDivsRef.current.get(hl.pageIndex)!;
        nextOverlays[hl.pageIndex] = measureItemSpanRects(pageEl, divs, hl.itemSpans);
        pageEl.scrollIntoView({behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center"});
      }
      setOverlays(nextOverlays);
      report({
        kind: "highlighted",
        pages: located.pages.map(p => p.pageIndex + 1),
        quotePreview: located.pages.map(p => p.quote).join(" ").slice(0, 160)
      });
    },
    [canonicalPageText, documentId, ensurePageMap, numPages, pages, report]
  );

  useEffect(() => {
    if (!citation || status.kind === "loading" || status.kind === "error") return;
    if (!pdfRef.current) return;
    void navigateCitation(citation);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when citation identity changes
  }, [citation?.documentId, citation?.startOffset, citation?.endOffset, citation?.occurrenceIndex, status.kind === "ready"]);

  const goPage = (page: number) => {
    if (!numPages) return;
    setCurrentPage(Math.max(1, Math.min(numPages, page)));
  };

  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar" role="toolbar" aria-label="PDF viewer controls">
        <button type="button" className="button subtle" disabled={currentPage <= 1} onClick={() => goPage(currentPage - 1)} aria-label="Previous page">
          Prev
        </button>
        <label className="pdf-page-label">
          <span className="sr-only">Page number</span>
          <input
            type="number"
            min={1}
            max={numPages || 1}
            value={currentPage}
            onChange={e => goPage(Number(e.target.value) || 1)}
            aria-label="Current page"
          />
          <span aria-live="polite">/ {numPages || "—"}</span>
        </label>
        <button type="button" className="button subtle" disabled={!numPages || currentPage >= numPages} onClick={() => goPage(currentPage + 1)} aria-label="Next page">
          Next
        </button>
        <span className="pdf-toolbar-sep" aria-hidden />
        <button type="button" className="button subtle" disabled={scale <= MIN_SCALE} onClick={() => setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))} aria-label="Zoom out">
          −
        </button>
        <span className="pdf-zoom" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
        <button type="button" className="button subtle" disabled={scale >= MAX_SCALE} onClick={() => setScale(s => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))} aria-label="Zoom in">
          +
        </button>
      </div>

      {status.kind === "loading" && <div className="empty" role="status">Loading original PDF…</div>}
      {status.kind === "error" && (
        <div className="error-banner" role="alert">
          {status.message}
        </div>
      )}
      {alignNotice && (
        <div className="warning-banner" role="status">
          {alignNotice} Verified source offsets are unchanged.
        </div>
      )}

      <div className="pdf-scroll" ref={scrollRef}>
        {visiblePages.map(pageNumber => (
          <PdfPageView
            key={`${pageNumber}-${scale}`}
            pageNumber={pageNumber}
            scale={scale}
            pdf={pdfRef.current}
            pdfjs={pdfjsRef.current}
            overlays={overlays[pageNumber - 1] ?? []}
            isActive={activeHighlights.some(h => h.pageIndex === pageNumber - 1)}
            renderGeneration={renderGenRef}
            onReady={(pageIndex, pageEl, textDivs, pageMap) => {
              pageElsRef.current.set(pageIndex, pageEl);
              textDivsRef.current.set(pageIndex, textDivs);
              if (pageMap) pageMapsRef.current.set(pageIndex, pageMap);
              // Remeasure after zoom/remount once the text layer is actually ready.
              const active = activeHighlights.find(h => h.pageIndex === pageIndex);
              if (active) {
                const rects = measureItemSpanRects(pageEl, textDivs, active.itemSpans);
                setOverlays(prev => ({...prev, [pageIndex]: rects}));
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PdfPageView(props: {
  pageNumber: number;
  scale: number;
  pdf: PdfDocument | null;
  pdfjs: PdfjsModule | null;
  overlays: OverlayRect[];
  isActive: boolean;
  renderGeneration: MutableRefObject<number>;
  onReady: (pageIndex: number, pageEl: HTMLElement, textDivs: HTMLElement[], pageMap: ReconstructedPageMap | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let textLayer: {cancel: () => void} | null = null;
    const gen = ++props.renderGeneration.current;

    (async () => {
      if (!props.pdf || !props.pdfjs || !canvasRef.current || !textRef.current || !pageRef.current) return;
      try {
        const page: PdfPage = await props.pdf.getPage(props.pageNumber);
        if (cancelled || gen !== props.renderGeneration.current) return;
        const viewport = page.getViewport({scale: props.scale});
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        textRef.current.style.width = `${viewport.width}px`;
        textRef.current.style.height = `${viewport.height}px`;
        pageRef.current.style.width = `${viewport.width}px`;
        pageRef.current.style.height = `${viewport.height}px`;

        const renderTask = page.render({canvasContext: ctx, viewport, canvas});
        await renderTask.promise;
        if (cancelled || gen !== props.renderGeneration.current) return;

        const content = await page.getTextContent();
        const pageMap = reconstructPageWithMap(content.items as object[]);
        textRef.current.innerHTML = "";
        const layer = new props.pdfjs.TextLayer({
          textContentSource: content,
          container: textRef.current,
          viewport
        });
        textLayer = layer;
        await layer.render();
        if (cancelled || gen !== props.renderGeneration.current) return;
        const textDivs = (layer.textDivs ?? []) as HTMLElement[];
        props.onReady(props.pageNumber - 1, pageRef.current, textDivs, pageMap);
      } catch (error) {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : "Page render failed");
      }
    })();

    return () => {
      cancelled = true;
      textLayer?.cancel();
    };
  }, [props.pageNumber, props.scale, props.pdf, props.pdfjs]);

  return (
    <div
      className={`pdf-page ${props.isActive ? "pdf-page-active" : ""}`}
      data-page={props.pageNumber}
      ref={pageRef}
      aria-label={`Page ${props.pageNumber}`}
    >
      <div className="pdf-page-label-chip">Page {props.pageNumber}</div>
      {error && <div className="error-banner">{error}</div>}
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div ref={textRef} className="pdf-text-layer" />
      <div className="pdf-highlight-layer" aria-hidden={!props.overlays.length}>
        {props.overlays.map((rect, i) => (
          <div
            key={i}
            className="pdf-cite-hl"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            }}
          />
        ))}
      </div>
    </div>
  );
}

function buildWindow(center: number, total: number, extra: number[]): number[] {
  const set = new Set<number>();
  for (let p = center - PAGE_WINDOW; p <= center + PAGE_WINDOW; p++) {
    if (p >= 1 && p <= total) set.add(p);
  }
  for (const p of extra) {
    if (p >= 1 && p <= total) {
      set.add(p);
      if (p - 1 >= 1) set.add(p - 1);
      if (p + 1 <= total) set.add(p + 1);
    }
  }
  return [...set].sort((a, b) => a - b);
}

function waitForFrames(n: number): Promise<void> {
  return new Promise(resolve => {
    let left = n;
    const tick = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  return new Promise(resolve => {
    const tick = () => {
      if (predicate()) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
