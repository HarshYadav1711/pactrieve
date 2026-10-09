"use client";

import {useCallback, useEffect, useId, useMemo, useRef, useState} from "react";
import {primaryDocumentId} from "@/lib/chat/multi-ids";
import type {VerifiedCitation} from "@/lib/chat/types";
import type {AgentStreamEvent} from "@/lib/agent/events";

type ActivityItem = {id: string; phase: string; detail: string; at: number};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations: VerifiedCitation[];
  activities: ActivityItem[];
  toolCalls: number;
  rounds: number;
  status?: string;
  error?: string;
  limitReason?: string;
  serverMessageId?: string;
  evidenceCount?: number;
};

type ConversationSummary = {
  id: string;
  documentId: string;
  documentIds?: string[];
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string | null;
};

type DocRef = {id: string; name: string; mime_type?: string};

type Props = {
  documents: DocRef[];
  onInspectCitation?: (citation: VerifiedCitation) => void;
};

function parseAgentSse(buffer: string, chunk: string): {events: AgentStreamEvent[]; rest: string} {
  let combined = (buffer + chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const events: AgentStreamEvent[] = [];
  let sep = combined.indexOf("\n\n");
  while (sep >= 0) {
    const raw = combined.slice(0, sep);
    combined = combined.slice(sep + 2);
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) {
      sep = combined.indexOf("\n\n");
      continue;
    }
    try {
      const data = JSON.parse(dataLines.join("\n")) as AgentStreamEvent;
      if (data && typeof data === "object" && typeof data.type === "string") events.push(data);
    } catch {
      /* ignore malformed frame */
    }
    sep = combined.indexOf("\n\n");
  }
  return {events, rest: combined};
}

export default function AgentResearchChat({documents, onInspectCitation}: Props) {
  const formId = useId();
  const documentIds = useMemo(() => documents.map(d => d.id), [documents]);
  const primaryId = useMemo(() => primaryDocumentId(documentIds), [documentIds]);
  const docsQuery = useMemo(() => documentIds.join(","), [documentIds]);

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [liveActivities, setLiveActivities] = useState<ActivityItem[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const activeServerMessageIdRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const response = await fetch(`/api/agent/conversations?docs=${encodeURIComponent(docsQuery)}`, {
        cache: "no-store"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load conversations.");
      setConversations(payload.conversations ?? []);
      setHistoryError(null);
      return payload.conversations as ConversationSummary[];
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Could not load conversations.");
      return [];
    }
  }, [docsQuery]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({behavior: "smooth", block: "end"});
  }, [messages, liveActivities, busy]);

  async function openConversation(id: string) {
    const response = await fetch(
      `/api/agent/conversations/${id}?docs=${encodeURIComponent(docsQuery)}`,
      {cache: "no-store"}
    );
    const payload = await response.json();
    if (!response.ok) {
      setHistoryError(payload.error ?? "Could not open conversation.");
      return;
    }
    setConversationId(id);
    const rawMessages = payload.messages ?? payload.conversation?.messages ?? [];
    const loaded: ChatMessage[] = rawMessages.map(
      (m: {
        id: string;
        role: "user" | "assistant";
        content: string;
        status: string;
        citations?: Array<{
          id: string;
          documentId: string;
          quote: string;
          sourceStart: number;
          sourceEnd: number;
          occurrenceIndex: number;
          sectionLabel: string | null;
        }>;
      }) => ({
        id: m.id,
        role: m.role,
        text: m.content,
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
        activities: [],
        toolCalls: 0,
        rounds: 0,
        status: m.status,
        serverMessageId: m.id
      })
    );
    setMessages(loaded);
  }

  async function onStop() {
    const mid = activeServerMessageIdRef.current;
    if (!mid || !primaryId) return;
    setStopping(true);
    try {
      await fetch(`/api/documents/${primaryId}/messages/${mid}/stop`, {method: "POST"});
    } finally {
      setStopping(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion("");
    setBusy(true);
    setLiveActivities([]);
    setHistoryError(null);

    const userId = `u_${Date.now()}`;
    const assistantId = `a_${Date.now()}`;
    activeAssistantIdRef.current = assistantId;
    activeServerMessageIdRef.current = null;

    setMessages(prev => [
      ...prev,
      {id: userId, role: "user", text: q, citations: [], activities: [], toolCalls: 0, rounds: 0},
      {
        id: assistantId,
        role: "assistant",
        text: "",
        citations: [],
        activities: [],
        toolCalls: 0,
        rounds: 0
      }
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/agent/research", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          question: q,
          documentIds,
          conversationId: conversationId ?? undefined
        }),
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Agent research failed (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        const {events, rest} = parseAgentSse(buffer, decoder.decode(value, {stream: true}));
        buffer = rest;
        for (const event of events) applyEvent(event, assistantId);
      }
      const flush = parseAgentSse(buffer, "\n\n");
      for (const event of flush.events) applyEvent(event, assistantId);
      await loadConversations();
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Agent research failed.";
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? {...m, error: message, status: "failed"} : m))
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
      activeAssistantIdRef.current = null;
    }
  }

  function applyEvent(event: AgentStreamEvent, assistantId: string) {
    if (event.type === "session") {
      setConversationId(event.conversationId);
      activeServerMessageIdRef.current = event.assistantMessageId;
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId ? {...m, serverMessageId: event.assistantMessageId} : m
        )
      );
      return;
    }
    if (event.type === "activity") {
      const item = {id: event.id, phase: event.phase, detail: event.detail, at: event.at};
      setLiveActivities(prev => [...prev, item]);
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? {...m, activities: [...m.activities, item]} : m))
      );
      return;
    }
    if (event.type === "tool_call") {
      const item = {
        id: event.id,
        phase: "tool_call",
        detail: `Calling ${event.name}(${event.argsPreview})`,
        at: Date.now()
      };
      setLiveActivities(prev => [...prev, item]);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {...m, activities: [...m.activities, item], toolCalls: m.toolCalls + 1}
            : m
        )
      );
      return;
    }
    if (event.type === "tool_result") {
      const item = {
        id: event.id,
        phase: "tool_result",
        detail: event.detail,
        at: Date.now()
      };
      setLiveActivities(prev => [...prev, item]);
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? {...m, activities: [...m.activities, item]} : m))
      );
      return;
    }
    if (event.type === "answer_delta") {
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? {...m, text: m.text + event.text} : m))
      );
      return;
    }
    if (event.type === "citation") {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId ? {...m, citations: [...m.citations, event.citation]} : m
        )
      );
      return;
    }
    if (event.type === "completed") {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                text: event.answerText || m.text,
                citations: event.citations.length ? event.citations : m.citations,
                status: event.status,
                limitReason: event.limitReason,
                rounds: event.rounds,
                toolCalls: event.toolCalls,
                evidenceCount: event.citations.length,
                serverMessageId: event.assistantMessageId ?? m.serverMessageId
              }
            : m
        )
      );
      if (event.conversationId) setConversationId(event.conversationId);
      return;
    }
    if (event.type === "error") {
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? {...m, error: event.message, status: "failed"} : m))
      );
    }
  }

  return (
    <section className="chat-panel agent-panel" aria-label="Agent research">
      <h2>Agent Research</h2>
      <p>
        Multi-step investigation with model-selected document tools. Activity below reflects actual
        tool execution — not a fixed retrieval script.
      </p>

      <div className="agent-history">
        <label>
          Saved conversations
          <select
            value={conversationId ?? ""}
            onChange={e => {
              const id = e.target.value;
              if (!id) {
                setConversationId(null);
                setMessages([]);
                return;
              }
              void openConversation(id);
            }}
          >
            <option value="">New investigation</option>
            {conversations.map(c => (
              <option key={c.id} value={c.id}>
                {(c.preview || "Conversation").slice(0, 60)} · {c.messageCount} msgs
              </option>
            ))}
          </select>
        </label>
        {historyError && <div className="error-banner">{historyError}</div>}
      </div>

      <div className="chat-thread" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <b>Ask a multi-part research question</b>
            <span>
              Example: compare liability caps and exceptions, then identify which contract requires
              longer termination notice.
            </span>
          </div>
        )}
        {messages.map(msg => (
          <article key={msg.id} className={`chat-message ${msg.role}`}>
            <header>
              <span className="chat-role">{msg.role === "user" ? "You" : "Agent"}</span>
              {msg.status && <span className={`chat-status-chip ${msg.status}`}>{msg.status}</span>}
              {msg.role === "assistant" && msg.toolCalls > 0 && (
                <span className="chat-meta">
                  {msg.rounds} rounds · {msg.toolCalls} tool calls
                </span>
              )}
            </header>
            {msg.role === "assistant" && msg.activities.length > 0 && (
              <ol className="agent-activity" aria-label="Research activity">
                {msg.activities.map(a => (
                  <li key={a.id}>
                    <span className="activity-phase">{a.phase}</span> {a.detail}
                  </li>
                ))}
              </ol>
            )}
            <div className="chat-body">{msg.text || (busy && msg.id === activeAssistantIdRef.current ? "…" : "")}</div>
            {msg.error && <div className="chat-error">{msg.error}</div>}
            {msg.limitReason && (
              <div className="chat-meta warning">Research limit: {msg.limitReason}</div>
            )}
            {msg.citations.length > 0 && (
              <ul className="citation-list">
                {msg.citations.map(c => (
                  <li key={`${c.evidenceId}-${c.startOffset}`}>
                    <button
                      type="button"
                      className="citation-card"
                      onClick={() => onInspectCitation?.(c)}
                    >
                      <span className="citation-badge">
                        {c.evidenceId} ·{" "}
                        {documents.find(d => d.id === c.documentId)?.name ?? c.documentId.slice(0, 8)}
                      </span>
                      <blockquote>{c.quote}</blockquote>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
        {busy && liveActivities.length > 0 && (
          <div className="chat-live-status" role="status">
            Latest: {liveActivities[liveActivities.length - 1]?.detail}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form id={formId} className="chat-form" onSubmit={e => void onSubmit(e)}>
        <label htmlFor={`${formId}-q`}>Research question</label>
        <textarea
          id={`${formId}-q`}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={busy}
          placeholder="Investigate across the selected contracts…"
        />
        <div className="chat-form-actions">
          <span className="chat-char-count">{question.length}/2000</span>
          <div style={{display: "flex", gap: 8}}>
            {busy && (
              <button type="button" className="button subtle" onClick={() => void onStop()} disabled={stopping}>
                {stopping ? "Stopping…" : "Stop"}
              </button>
            )}
            <button type="submit" className="button primary" disabled={busy || !question.trim()}>
              {busy ? "Researching…" : "Start agent research"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
