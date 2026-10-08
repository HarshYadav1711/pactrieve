"use client";

import {useEffect, useId, useRef, useState} from "react";
import {parseSseChunk} from "@/lib/chat/sse";
import type {ChatStreamEvent, EvidenceItem, VerifiedCitation} from "@/lib/chat/types";

type Stage = "idle" | "retrieving" | "preparing" | "generating" | "done" | "error";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  stage: Stage;
  evidence: EvidenceItem[];
  citations: VerifiedCitation[];
  coverageStatus?: string;
  coverageNotes?: string[];
  answerStatus?: string;
  rejectedEvidenceIds?: string[];
  error?: string;
  truncated?: boolean;
  provisional?: boolean;
  replacedProvisional?: boolean;
  reasonCode?: string;
};

type Props = {
  documentId: string;
  documentName: string;
  onInspectCitation?: (citation: VerifiedCitation) => void;
};

let messageSeq = 0;
function nextId(prefix: string) {
  messageSeq += 1;
  return `${prefix}-${messageSeq}`;
}

export default function DocumentChat({documentId, documentName, onInspectCitation}: Props) {
  const formId = useId();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [liveStage, setLiveStage] = useState<Stage>("idle");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: "smooth", block: "end"});
  }, [messages, liveStage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    const userMsg: ChatMessage = {
      id: nextId("u"),
      role: "user",
      text: trimmed,
      stage: "done",
      evidence: [],
      citations: []
    };
    const assistantId = nextId("a");
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      text: "",
      stage: "retrieving",
      evidence: [],
      citations: []
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setQuestion("");
    setBusy(true);
    setLiveStage("retrieving");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`/api/documents/${documentId}/chat`, {
        method: "POST",
        headers: {"Content-Type": "application/json", Accept: "text/event-stream"},
        body: JSON.stringify({question: trimmed}),
        signal: controller.signal
      });

      if (!response.ok) {
        let message = `Chat request failed (${response.status}).`;
        try {
          const payload = await response.json();
          if (payload?.error) message = String(payload.error);
        } catch { /* ignore */ }
        updateAssistant(assistantId, msg => ({
          ...msg,
          stage: "error",
          error: message,
          text: msg.text || message
        }));
        setLiveStage("error");
        return;
      }

      if (!response.body) {
        updateAssistant(assistantId, msg => ({
          ...msg,
          stage: "error",
          error: "No response stream from server.",
          text: "No response stream from server."
        }));
        setLiveStage("error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, {stream: true});
        const parsed = parseSseChunk(buffer, chunk);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          applyEvent(assistantId, event);
        }
      }
      const tail = decoder.decode();
      if (tail || buffer) {
        const parsed = parseSseChunk(buffer, tail);
        for (const event of parsed.events) applyEvent(assistantId, event);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Chat failed.";
      updateAssistant(assistantId, msg => ({
        ...msg,
        stage: "error",
        error: message,
        text: msg.text || message
      }));
      setLiveStage("error");
    } finally {
      setBusy(false);
      abortRef.current = null;
      setLiveStage(prev => (prev === "retrieving" || prev === "preparing" || prev === "generating" ? "done" : prev));
    }
  }

  function updateAssistant(id: string, fn: (msg: ChatMessage) => ChatMessage) {
    setMessages(prev => prev.map(m => (m.id === id ? fn(m) : m)));
  }

  function applyEvent(assistantId: string, event: ChatStreamEvent) {
    switch (event.type) {
      case "retrieval_started":
        setLiveStage("retrieving");
        updateAssistant(assistantId, m => ({...m, stage: "retrieving"}));
        break;
      case "evidence_prepared":
        setLiveStage("preparing");
        updateAssistant(assistantId, m => ({
          ...m,
          stage: "preparing",
          evidence: event.evidence,
          coverageStatus: event.coverage.status,
          coverageNotes: event.coverage.notes,
          truncated: event.truncated
        }));
        break;
      case "generation_started":
        setLiveStage("generating");
        updateAssistant(assistantId, m => ({...m, stage: "generating"}));
        break;
      case "answer_delta":
        setLiveStage("generating");
        updateAssistant(assistantId, m => ({
          ...m,
          stage: "generating",
          text: m.text + event.text
        }));
        break;
      case "citation":
        updateAssistant(assistantId, m => ({
          ...m,
          citations: m.citations.some(c => c.evidenceId === event.citation.evidenceId)
            ? m.citations
            : [...m.citations, event.citation]
        }));
        break;
      case "completed":
        setLiveStage("done");
        updateAssistant(assistantId, m => ({
          ...m,
          stage: "done",
          // Always take the server final payload — may replace provisional streamed claims.
          text: event.answerText,
          citations: event.citations,
          answerStatus: event.status,
          rejectedEvidenceIds: event.rejectedEvidenceIds,
          provisional: event.provisional,
          replacedProvisional: event.replacedProvisional,
          reasonCode: event.reasonCode,
          coverageStatus: event.coverageStatus
        }));
        break;
      case "error":
        setLiveStage("error");
        updateAssistant(assistantId, m => ({
          ...m,
          stage: "error",
          error: event.message,
          text: m.text || event.message
        }));
        break;
    }
  }

  const stageLabel =
    liveStage === "retrieving" ? "Retrieving passages…"
    : liveStage === "preparing" ? "Preparing verified evidence…"
    : liveStage === "generating" ? "Generating answer…"
    : null;

  return (
    <section className="chat-panel" aria-label="Document chat">
      <div className="eyebrow">ANALYSIS / GROUNDED CHAT</div>
      <h2>Ask this contract</h2>
      <p>
        Questions are answered from retrieved passages in <strong>{documentName}</strong>.
        Quotations shown as verified are checked against stored source text — not model-reported offsets.
      </p>

      <div className="chat-thread" role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && (
          <div className="chat-empty">
            <b>No questions yet</b>
            <span>Ask about a clause, notice period, liability cap, or governing law.</span>
          </div>
        )}
        {messages.map(msg => (
          <article
            key={msg.id}
            className={`chat-message ${msg.role}${msg.answerStatus === "insufficient_evidence" ? " unsupported" : ""}${msg.answerStatus === "answered" ? " grounded" : ""}`}
          >
            <header>
              <span className="chat-role">{msg.role === "user" ? "You" : "Pactrieve"}</span>
              {msg.role === "assistant" && msg.answerStatus && (
                <span className={`chat-status-chip ${msg.answerStatus}`}>
                  {msg.answerStatus === "answered" ? "Answered"
                    : msg.answerStatus === "insufficient_evidence" ? "Insufficient evidence"
                    : "Failed"}
                </span>
              )}
              {msg.role === "assistant" && msg.stage !== "done" && msg.stage !== "error" && msg.stage !== "idle" && (
                <span className="chat-status-chip pending">{stageLabelFor(msg.stage)}</span>
              )}
            </header>
            {msg.replacedProvisional && msg.answerStatus === "insufficient_evidence" && (
              <div className="chat-withdrawn" role="status">
                Provisional streamed text was withdrawn — no verified supporting quotation was established.
              </div>
            )}
            <div className={`chat-body${msg.answerStatus === "insufficient_evidence" ? " insufficient" : ""}`}>
              {formatAnswer(msg.text)}
            </div>
            {msg.error && msg.stage === "error" && (
              <div className="chat-error" role="alert">{msg.error}</div>
            )}
            {msg.coverageStatus && msg.role === "assistant" && (
              <div className="chat-meta">
                Coverage: <code>{msg.coverageStatus}</code>
                {msg.truncated ? " · evidence truncated for prompt budget" : ""}
                {msg.answerStatus === "answered" ? "" : msg.provisional ? " · not fully verified" : ""}
              </div>
            )}
            {msg.answerStatus === "answered" && msg.citations.length > 0 && (
              <ul className="citation-list">
                {msg.citations.map(citation => (
                  <li key={citation.evidenceId}>
                    <button
                      type="button"
                      className="citation-card"
                      onClick={() => onInspectCitation?.(citation)}
                    >
                      <span className="citation-badge">Verified · {citation.evidenceId}</span>
                      <blockquote>{citation.quote}</blockquote>
                      <small>
                        Pages {citation.pageIndices.map(p => p + 1).join(", ") || "—"}
                        {citation.sectionLabel ? ` · ${citation.sectionLabel}` : ""}
                        {" · "}offsets {citation.startOffset}–{citation.endOffset}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {msg.rejectedEvidenceIds && msg.rejectedEvidenceIds.length > 0 && (
              <div className="chat-meta warning">
                Rejected evidence IDs: {msg.rejectedEvidenceIds.join(", ")}
              </div>
            )}
          </article>
        ))}
        <div ref={bottomRef} />
      </div>

      {stageLabel && busy && (
        <div className="chat-live-status" role="status">{stageLabel}</div>
      )}

      <form id={formId} className="chat-form" onSubmit={e => void send(e)}>
        <label htmlFor={`${formId}-q`}>Question</label>
        <textarea
          id={`${formId}-q`}
          rows={3}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="e.g. What is the liability cap?"
          maxLength={2000}
          disabled={busy}
        />
        <div className="chat-form-actions">
          <span className="chat-char-count">{question.trim().length}/2000</span>
          <button className="button primary" type="submit" disabled={busy || question.trim().length === 0}>
            {busy ? "Working…" : "Ask"}
          </button>
        </div>
      </form>

      <div className="sidebar-note">
        <strong>Citation note</strong>
        <small>
          Click a verified quotation to scroll the extracted source preview.
          PDF/DOCX visual page-overlay highlighting is a later phase — this view uses stored text offsets.
        </small>
      </div>
    </section>
  );
}

function stageLabelFor(stage: Stage): string {
  if (stage === "retrieving") return "Retrieving";
  if (stage === "preparing") return "Evidence";
  if (stage === "generating") return "Streaming";
  return stage;
}

/** Minimal safe formatting: escape HTML, preserve paragraphs and [eN] markers. */
function formatAnswer(text: string) {
  if (!text) return null;
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const withCitations = escaped
    .replace(/\[(e\d+)\]/g, '<span class="inline-evidence-ref">[$1]</span>')
    .replace(/\u3010(e\d+)\u3011/g, '<span class="inline-evidence-ref">[$1]</span>');
  const paragraphs = withCitations.split(/\n{2,}/).map((para, i) => (
    <p key={i} dangerouslySetInnerHTML={{__html: para.replace(/\n/g, "<br/>")}} />
  ));
  return <>{paragraphs}</>;
}
