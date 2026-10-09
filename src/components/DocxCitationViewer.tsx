"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import type {VerifiedCitation} from "@/lib/chat/types";
import type {DocxBlock, DocxInline, DocxLeafHighlight, DocxPreviewModel} from "@/lib/docx";
import {locateCitationOnDocx} from "@/lib/docx/locate";

export type DocxViewerNavStatus =
  | {kind: "idle"}
  | {kind: "loading"}
  | {kind: "ready"}
  | {kind: "error"; message: string}
  | {kind: "highlighting"}
  | {kind: "highlighted"; blockId: string; quotePreview: string}
  | {kind: "align_failed"; message: string; technical?: string};

type Props = {
  documentId: string;
  canonicalText: string;
  citation: VerifiedCitation | null;
  onStatus?: (status: DocxViewerNavStatus) => void;
  onAlignFailed?: (citation: VerifiedCitation) => void;
};

type OverlayRect = {left: number; top: number; width: number; height: number};

export default function DocxCitationViewer({
  documentId,
  canonicalText,
  citation,
  onStatus,
  onAlignFailed
}: Props) {
  const [status, setStatus] = useState<DocxViewerNavStatus>({kind: "loading"});
  const [preview, setPreview] = useState<DocxPreviewModel | null>(null);
  const [overlays, setOverlays] = useState<OverlayRect[]>([]);
  const [activeLeaves, setActiveLeaves] = useState<DocxLeafHighlight[]>([]);
  const [alignNotice, setAlignNotice] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const leafEls = useRef<Map<number, HTMLElement>>(new Map());

  const report = useCallback(
    (next: DocxViewerNavStatus) => {
      setStatus(next);
      onStatus?.(next);
    },
    [onStatus]
  );

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setOverlays([]);
    setActiveLeaves([]);
    setAlignNotice(null);
    report({kind: "loading"});
    (async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/docx-preview`, {cache: "no-store"});
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Preview failed");
        if (cancelled) return;
        setPreview({
          blocks: payload.blocks,
          renderText: payload.renderText,
          canonicalApprox: payload.canonicalApprox,
          leaves: payload.leaves,
          warnings: payload.warnings ?? []
        });
        report({kind: "ready"});
      } catch (error) {
        if (cancelled) return;
        report({
          kind: "error",
          message: error instanceof Error ? error.message : "Could not load DOCX preview."
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, report]);

  const measure = useCallback((leaves: DocxLeafHighlight[]) => {
    const root = rootRef.current;
    if (!root) return [];
    const rootRect = root.getBoundingClientRect();
    const rects: OverlayRect[] = [];
    for (const leaf of leaves) {
      const el = leafEls.current.get(leaf.leafIndex);
      if (!el) continue;
      const textNode = firstTextNode(el);
      if (!textNode?.textContent) continue;
      const len = textNode.textContent.length;
      const start = clamp(leaf.startChar, 0, len);
      const end = clamp(leaf.endChar, 0, len);
      if (end <= start) continue;
      const range = document.createRange();
      try {
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
      } catch {
        continue;
      }
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width < 0.5 || rect.height < 0.5) continue;
        rects.push({
          left: rect.left - rootRect.left + root.scrollLeft,
          top: rect.top - rootRect.top + root.scrollTop,
          width: rect.width,
          height: rect.height
        });
      }
    }
    return rects;
  }, []);

  const navigateCitation = useCallback(
    (cite: VerifiedCitation, model: DocxPreviewModel) => {
      report({kind: "highlighting"});
      setAlignNotice(null);
      setOverlays([]);
      setActiveLeaves([]);

      const located = locateCitationOnDocx({
        documentId,
        citationDocumentId: cite.documentId,
        startOffset: cite.startOffset,
        endOffset: cite.endOffset,
        canonicalText,
        preview: model
      });

      if (!located.ok) {
        const message =
          located.reason === "WRONG_DOCUMENT"
            ? "This citation belongs to a different document."
            : "Verified source located, but precise DOCX highlighting is unavailable for this passage.";
        setAlignNotice(message);
        report({kind: "align_failed", message, technical: [located.reason, located.detail].filter(Boolean).join(" · ")});
        onAlignFailed?.(cite);
        if (located.fallbackBlockId) {
          document.getElementById(`docx-block-${located.fallbackBlockId}`)?.scrollIntoView({
            behavior: prefersReducedMotion() ? "auto" : "smooth",
            block: "center"
          });
        }
        return;
      }

      setActiveLeaves(located.leaves);
      requestAnimationFrame(() => {
        const focus = document.getElementById(`docx-block-${located.focusBlockId}`);
        focus?.scrollIntoView({behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center"});
        setOverlays(measure(located.leaves));
        report({
          kind: "highlighted",
          blockId: located.focusBlockId,
          quotePreview: located.quote.slice(0, 160)
        });
      });
    },
    [canonicalText, documentId, measure, onAlignFailed, report]
  );

  useEffect(() => {
    if (!citation || !preview || status.kind === "loading" || status.kind === "error") return;
    navigateCitation(citation, preview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citation?.documentId, citation?.startOffset, citation?.endOffset, citation?.occurrenceIndex, preview, status.kind === "ready"]);

  useEffect(() => {
    if (!activeLeaves.length) return;
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setOverlays(measure(activeLeaves)));
    ro.observe(root);
    return () => ro.disconnect();
  }, [activeLeaves, measure]);

  const activeSet = new Set(activeLeaves.map(l => l.leafIndex));

  return (
    <div className="docx-viewer">
      {status.kind === "loading" && <div className="empty" role="status">Loading DOCX preview…</div>}
      {status.kind === "error" && (
        <div className="error-banner" role="alert">
          {status.message}
        </div>
      )}
      {alignNotice && (
        <div className="warning-banner" role="status">
          {alignNotice} Verified source offsets are unchanged — use extracted text if needed.
        </div>
      )}
      {preview && (
        <div className="docx-scroll" ref={rootRef}>
          <div className="docx-highlight-layer" aria-hidden={!overlays.length}>
            {overlays.map((rect, i) => (
              <div
                key={i}
                className="docx-cite-hl"
                style={{left: rect.left, top: rect.top, width: rect.width, height: rect.height}}
              />
            ))}
          </div>
          <article className="docx-article" aria-label="DOCX semantic preview">
            {preview.blocks.map(block => (
              <BlockView
                key={block.id}
                block={block}
                activeLeafIndexes={activeSet}
                registerLeaf={(index, el) => {
                  if (el) leafEls.current.set(index, el);
                  else leafEls.current.delete(index);
                }}
              />
            ))}
          </article>
        </div>
      )}
    </div>
  );
}

function BlockView(props: {
  block: DocxBlock;
  activeLeafIndexes: Set<number>;
  registerLeaf: (index: number, el: HTMLElement | null) => void;
}) {
  const {block} = props;
  if (block.kind === "paragraph") {
    return (
      <p id={`docx-block-${block.id}`} className="docx-p">
        <Inlines {...props} inlines={block.children} />
      </p>
    );
  }
  if (block.kind === "heading") {
    const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return (
      <Tag id={`docx-block-${block.id}`} className={`docx-h docx-h${block.level}`}>
        <Inlines {...props} inlines={block.children} />
      </Tag>
    );
  }
  if (block.kind === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag id={`docx-block-${block.id}`} className="docx-list">
        {block.items.map(item => (
          <li key={item.id} id={`docx-block-${item.id}`}>
            <Inlines {...props} inlines={item.children} />
          </li>
        ))}
      </ListTag>
    );
  }
  return (
    <table id={`docx-block-${block.id}`} className="docx-table">
      <tbody>
        {block.rows.map(row => (
          <tr key={row.id}>
            {row.cells.map(cell => (
              <td key={cell.id}>
                {cell.blocks.map(inner => (
                  <BlockView key={inner.id} {...props} block={inner} />
                ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Inlines(props: {
  inlines: DocxInline[];
  registerLeaf: (index: number, el: HTMLElement | null) => void;
  activeLeafIndexes: Set<number>;
}) {
  return (
    <>
      {props.inlines.map((node, i) => {
        if (node.kind === "br") return <br key={i} />;
        if (node.kind === "link") {
          return (
            <a key={i} href={node.href} rel="noopener noreferrer" target="_blank" className="docx-link">
              <Inlines {...props} inlines={node.children} />
            </a>
          );
        }
        const leafIndex = node.leafIndex;
        const className = [
          node.bold ? "docx-bold" : "",
          node.italic ? "docx-italic" : "",
          leafIndex != null && props.activeLeafIndexes.has(leafIndex) ? "docx-leaf-active" : ""
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <span
            key={i}
            className={className || undefined}
            data-leaf-index={leafIndex}
            ref={el => {
              if (leafIndex != null) props.registerLeaf(leafIndex, el);
            }}
          >
            {node.text}
          </span>
        );
      })}
    </>
  );
}

function firstTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return root as Text;
  for (const child of Array.from(root.childNodes)) {
    const found = firstTextNode(child);
    if (found) return found;
  }
  return null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
