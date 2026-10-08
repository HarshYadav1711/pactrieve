"use client";

import {useCallback, useEffect, useId, useRef, useState} from "react";
import {parseSseChunk} from "@/lib/chat/sse";
import type {ChatStreamEvent, EvidenceItem, VerifiedCitation} from "@/lib/chat/types";

type Stage = "idle" | "retrieving" | "preparing" | "generating" | "stopping" | "done" | "error";

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
  persistedStatus?: string;
  persistenceOk?: boolean;
  serverMessageId?: string;
};

type ConversationSummary = {
  id: string;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string | null;
};

type Props = {
  documentId: string;
  documentName: string;
  onInspectCitation?: (citation: VerifiedCitation) => void;
};

export default function DocumentChat({documentId, documentName, onInspectCitation}: Props) {
  const formId = useId();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [liveStage, setLiveStage] = useState<Stage>("idle");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const activeServerMessageIdRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch(`/api/documents/${documentId}/conversations`, {cache: "no-store"});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load conversations.");
      setConversations(payload.conversations ?? []);
      setHistoryError(null);
      return payload.conversations as ConversationSummary[];
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Could not load conversations.");
      return [] as ConversationSummary[];
    }
  }, [documentId]);

  const loadConversation = useCallback(async (id: string) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/conversations/${id}`, {cache: "no-store"});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load conversation.");
      const conv = payload.conversation;
      setConversationId(conv.id);
      setMessages(
        (conv.messages ?? []).map((m: {
          id: string;
          role: "user" | "assistant";
          content: string;
          status: string;
          citations?: Array<{
            id: string;
            documentId: string;
            sourceStart: number;
            sourceEnd: number;
            quote: string;
            occurrenceIndex: number;
            sectionLabel: string | null;
          }>;
        }) => ({
          id: m.id,
          serverMessageId: m.id,
          role: m.role,
          text: m.content,
          stage: "done" as Stage,
          evidence: [],
          citations: (m.citations ?? []).map(c => ({
            evidenceId: c.id,
            documentId: c.documentId,
            quote: c.quote,
            startOffset: c.sourceStart,
            endOffset: c.sourceEnd,
            pageIndices: [],
            sectionLabel: c.sectionLabel,
            occurrenceIndex: c.occurrenceIndex,
            verified: true as const
          })),
          answerStatus:
            m.status === "complete" ? (m.content.startsWith("Insufficient evidence") ? "insufficient_evidence" : "answered")
            : m.status === "stopped" ? "stopped"
            : m.status === "failed" ? "failed"
            : m.status === "interrupted" ? "interrupted"
            : m.status,
          persistedStatus: m.status,
          persistenceOk: true,
          provisional: m.status === "stopped" || m.status === "interrupted"
        }))
      );
      setHistoryError(null);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Could not load conversation.");
    } finally {
      setHistoryLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      const list = await loadConversations();
      if (cancelled) return;
      if (list.length) {
        await loadConversation(list[0].id);
      } else {
        setConversationId(null);
        setMessages([]);
        setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, loadConversations, loadConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: "smooth", block: "end"});
  }, [messages, liveStage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function startNewConversation() {
    if (busy) return;
    try {
      const response = await fetch(`/api/documents/${documentId}/conversations`, {method: "POST"});
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create conversation.");
      setConversationId(payload.conversation.id);
      setMessages([]);
      await loadConversations();
      setHistoryError(null);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Could not create conversation.");
    }
  }

  async function stopGeneration() {
    if (!busy || stopping) return;
    setStopping(true);
    setLiveStage("stopping");
    const serverMessageId = activeServerMessageIdRef.current;
    if (serverMessageId) {
      try {
        await fetch(`/api/documents/${documentId}/messages/${serverMessageId}/stop`, {method: "POST"});
      } catch {
        /* stream abort still attempted */
      }
    }
    abortRef.current?.abort();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      try {
        const response = await fetch(`/api/documents/${documentId}/conversations`, {method: "POST"});
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not create conversation.");
        activeConversationId = payload.conversation.id as string;
        setConversationId(activeConversationId);
      } catch (err) {
        setHistoryError(err instanceof Error ? err.message : "Could not create conversation.");
        return;
      }
    }

    const localUserId = `local-u-${Date.now()}`;
    const localAssistantId = `local-a-${Date.now()}`;
    activeAssistantIdRef.current = localAssistantId;

    setMessages(prev => [
      ...prev,
      {
        id: localUserId,
        role: "user",
        text: trimmed,
        stage: "done",
        evidence: [],
        citations: []
      },
      {
        id: localAssistantId,
        role: "assistant",
        text: "",
        stage: "retrieving",
        evidence: [],
        citations: []
      }
    ]);
    setQuestion("");
    setBusy(true);
    setStopping(false);
    setLiveStage("retrieving");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`/api/documents/${documentId}/chat`, {
        method: "POST",
        headers: {"Content-Type": "application/json", Accept: "text/event-stream"},
        body: JSON.stringify({question: trimmed, conversationId: activeConversationId}),
        signal: controller.signal
      });

      if (!response.ok) {
        let message = `Chat request failed (${response.status}).`;
        try {
          const payload = await response.json();
          if (payload?.error) message = String(payload.error);
        } catch { /* ignore */ }
        updateAssistant(localAssistantId, msg => ({
          ...msg,
          stage: "error",
          error: message,
          text: msg.text || message,
          answerStatus: "failed"
        }));
        setLiveStage("error");
        return;
      }

      if (!response.body) {
        updateAssistant(localAssistantId, msg => ({
          ...msg,
          stage: "error",
          error: "No response stream from server.",
          text: "No response stream from server.",
          answerStatus: "failed"
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
          applyEvent(localAssistantId, localUserId, event);
        }
      }
      const tail = decoder.decode();
      if (tail || buffer) {
        const parsed = parseSseChunk(buffer, tail);
        for (const event of parsed.events) applyEvent(localAssistantId, localUserId, event);
      }
      await loadConversations();
    } catch (err) {
      if (controller.signal.aborted) {
        // Stop path: completed event should arrive if server finalized; otherwise mark stopping wait.
        setLiveStage(prev => (prev === "stopping" ? "stopping" : prev));
      } else {
        const message = err instanceof Error ? err.message : "Chat failed.";
        updateAssistant(localAssistantId, msg => ({
          ...msg,
          stage: "error",
          error: message,
          text: msg.text || message,
          answerStatus: "failed"
        }));
        setLiveStage("error");
      }
    } finally {
      setBusy(false);
      setStopping(false);
      abortRef.current = null;
      activeAssistantIdRef.current = null;
      activeServerMessageIdRef.current = null;
      setLiveStage(prev => (prev === "retrieving" || prev === "preparing" || prev === "generating" || prev === "stopping" ? "done" : prev));
    }
  }

  function updateAssistant(id: string, fn: (msg: ChatMessage) => ChatMessage) {
    setMessages(prev => prev.map(m => (m.id === id ? fn(m) : m)));
  }

  function applyEvent(assistantId: string, userId: string, event: ChatStreamEvent) {
    switch (event.type) {
      case "session":
        activeServerMessageIdRef.current = event.assistantMessageId;
        setConversationId(event.conversationId);
        setMessages(prev =>
          prev.map(m => {
            if (m.id === userId) return {...m, serverMessageId: event.userMessageId, id: event.userMessageId};
            if (m.id === assistantId) {
              return {...m, serverMessageId: event.assistantMessageId, id: event.assistantMessageId};
            }
            return m;
          })
        );
        // Keep applying events to the new assistant id.
        activeAssistantIdRef.current = event.assistantMessageId;
        break;
      case "retrieval_started":
        setLiveStage("retrieving");
        updateByActive(assistantId, m => ({...m, stage: "retrieving"}));
        break;
      case "evidence_prepared":
        setLiveStage("preparing");
        updateByActive(assistantId, m => ({
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
        updateByActive(assistantId, m => ({...m, stage: "generating"}));
        break;
      case "answer_delta":
        setLiveStage(prev => (prev === "stopping" ? "stopping" : "generating"));
        updateByActive(assistantId, m => ({
          ...m,
          stage: m.stage === "stopping" ? "stopping" : "generating",
          text: m.text + event.text
        }));
        break;
      case "citation":
        updateByActive(assistantId, m => ({
          ...m,
          citations: m.citations.some(c => c.evidenceId === event.citation.evidenceId)
            ? m.citations
            : [...m.citations, event.citation]
        }));
        break;
      case "completed":
        setLiveStage("done");
        updateByActive(assistantId, m => ({
          ...m,
          stage: "done",
          text: event.answerText,
          citations: event.citations,
          answerStatus: event.status,
          rejectedEvidenceIds: event.rejectedEvidenceIds,
          provisional: event.provisional,
          replacedProvisional: event.replacedProvisional,
          reasonCode: event.reasonCode,
          coverageStatus: event.coverageStatus,
          persistedStatus: event.persistedStatus,
          persistenceOk: event.persistenceOk,
          serverMessageId: event.assistantMessageId ?? m.serverMessageId
        }));
        break;
      case "error":
        setLiveStage("error");
        updateByActive(assistantId, m => ({
          ...m,
          stage: "error",
          error: event.message,
          text: m.text || event.message,
          answerStatus: "failed"
        }));
        break;
    }
  }

  function updateByActive(fallbackId: string, fn: (msg: ChatMessage) => ChatMessage) {
    const id = activeAssistantIdRef.current ?? fallbackId;
    setMessages(prev => prev.map(m => (m.id === id || m.serverMessageId === id || m.id === fallbackId ? fn(m) : m)));
  }

  const stageLabel =
    liveStage === "retrieving" ? "Retrieving passages…"
    : liveStage === "preparing" ? "Preparing verified evidence…"
    : liveStage === "generating" ? "Generating answer…"
    : liveStage === "stopping" ? "Stopping and saving…"
    : null;

  return (
    <section className="chat-panel" aria-label="Document chat">
      <div className="eyebrow">ANALYSIS / GROUNDED CHAT</div>
      <h2>Ask this contract</h2>
      <p>
        Questions are answered from retrieved passages in <strong>{documentName}</strong>.
        Conversations persist across refresh. Quotations shown as verified are checked against stored source text.
      </p>

      <div className="conversation-bar">
        <label htmlFor={`${formId}-conv`}>Conversation</label>
        <div className="conversation-controls">
          <select
            id={`${formId}-conv`}
            value={conversationId ?? ""}
            disabled={busy || historyLoading}
            onChange={e => {
              const value = e.target.value;
              if (!value) return;
              void loadConversation(value);
            }}
          >
            {!conversations.length && <option value="">No saved conversations</option>}
            {conversations.map(c => (
              <option key={c.id} value={c.id}>
                {new Date(c.updatedAt).toLocaleString()} · {c.messageCount} msg
                {c.preview ? ` · ${c.preview.slice(0, 40)}` : ""}
              </option>
            ))}
          </select>
          <button type="button" className="button subtle" disabled={busy} onClick={() => void startNewConversation()}>
            New
          </button>
        </div>
      </div>

      {historyError && <div className="chat-error" role="alert">{historyError}</div>}
      {historyLoading && <div className="chat-live-status" role="status">Loading conversation history…</div>}

      <div className="chat-thread" role="log" aria-live="polite" aria-relevant="additions">
        {!historyLoading && messages.length === 0 && (
          <div className="chat-empty">
            <b>No messages yet</b>
            <span>Ask about a clause, notice period, liability cap, or governing law.</span>
          </div>
        )}
        {messages.map(msg => (
          <article
            key={msg.id}
            className={`chat-message ${msg.role}${msg.answerStatus === "insufficient_evidence" ? " unsupported" : ""}${msg.answerStatus === "answered" ? " grounded" : ""}${msg.answerStatus === "stopped" ? " stopped" : ""}`}
          >
            <header>
              <span className="chat-role">{msg.role === "user" ? "You" : "Pactrieve"}</span>
              {msg.role === "assistant" && msg.answerStatus && (
                <span className={`chat-status-chip ${msg.answerStatus}`}>
                  {statusLabel(msg)}
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
            {msg.persistedStatus === "stopped" && msg.persistenceOk && (
              <div className="chat-stopped-banner" role="status">Stopped · Partial answer saved</div>
            )}
            {msg.persistenceOk === false && (
              <div className="chat-error" role="alert">
                Answer text may not be fully saved. Please retry or refresh and inspect history.
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
                {msg.persistedStatus ? ` · saved as ${msg.persistedStatus}` : ""}
              </div>
            )}
            {(msg.answerStatus === "answered" || msg.answerStatus === "stopped") && msg.citations.length > 0 && (
              <ul className="citation-list">
                {msg.citations.map(citation => (
                  <li key={`${citation.evidenceId}-${citation.startOffset}`}>
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

      {stageLabel && (busy || stopping) && (
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
          <div className="chat-action-group">
            {busy && (
              <button
                type="button"
                className="button subtle stop-button"
                onClick={() => void stopGeneration()}
                disabled={stopping}
              >
                {stopping ? "Stopping…" : "Stop"}
              </button>
            )}
            <button className="button primary" type="submit" disabled={busy || question.trim().length === 0}>
              {busy ? "Working…" : "Ask"}
            </button>
          </div>
        </div>
      </form>

      <div className="sidebar-note">
        <strong>Citation note</strong>
        <small>
          Click a verified quotation to scroll the extracted source preview.
          Stop saves the accepted partial answer after the server confirms persistence.
        </small>
      </div>
    </section>
  );
}

function statusLabel(msg: ChatMessage): string {
  if (msg.persistedStatus === "stopped" && msg.persistenceOk) return "Stopped · saved";
  if (msg.persistedStatus === "interrupted") return "Interrupted";
  if (msg.answerStatus === "answered") return "Answered";
  if (msg.answerStatus === "insufficient_evidence") return "Insufficient evidence";
  if (msg.answerStatus === "stopped") return "Stopped";
  if (msg.answerStatus === "failed") return "Failed";
  return String(msg.answerStatus);
}

function stageLabelFor(stage: Stage): string {
  if (stage === "retrieving") return "Retrieving";
  if (stage === "preparing") return "Evidence";
  if (stage === "generating") return "Streaming";
  if (stage === "stopping") return "Stopping";
  return stage;
}

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
