import {randomUUID} from "node:crypto";
import type {VerifiedCitation} from "../types.ts";
import {
  canTransition,
  DEFAULT_CONVERSATION_LIMIT,
  DEFAULT_MESSAGE_LIMIT,
  isTerminalStatus,
  type ConversationDetail,
  type ConversationStore,
  type ConversationSummary,
  type FinalizeAssistantInput,
  type MessageStatus,
  type StoredCitation,
  type StoredMessage
} from "./types.ts";

interface MemoryConversation {
  id: string;
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
}

function sameDocumentSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

interface MemoryMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
  seq: number;
}

export type MemoryConversationStore = ConversationStore & {
  /** Test-only: backdate updatedAt for stale-generation recovery. */
  forceUpdatedAt(messageId: string, iso: string): void;
  getRawMessage(messageId: string): MemoryMessage | undefined;
};

/**
 * Deterministic in-memory conversation store for unit tests.
 * Mirrors Supabase semantics for status transitions and document scoping.
 */
export function createMemoryConversationStore(): MemoryConversationStore {
  const conversations = new Map<string, MemoryConversation>();
  const messages = new Map<string, MemoryMessage>();
  const citations = new Map<string, StoredCitation[]>();
  let seqCounter = 0;

  function touchConversation(id: string) {
    const c = conversations.get(id);
    if (!c) return;
    c.updatedAt = new Date().toISOString();
  }

  function toStored(msg: MemoryMessage): StoredMessage {
    return {
      ...msg,
      citations: citations.get(msg.id) ?? []
    };
  }

  function sortedMessages(conversationId: string): MemoryMessage[] {
    return [...messages.values()]
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.seq - b.seq || a.createdAt.localeCompare(b.createdAt));
  }

  function previewFor(conversationId: string): string | null {
    const last = sortedMessages(conversationId).at(-1);
    return last?.content ? last.content.slice(0, 120) : null;
  }

  return {
    async createConversation(documentId) {
      return this.createConversationForDocuments([documentId]);
    },

    async createConversationForDocuments(documentIds) {
      const unique = [...new Set(documentIds.map(id => id.trim()).filter(Boolean))];
      if (!unique.length) throw new Error("At least one document ID is required.");
      const now = new Date().toISOString();
      const id = randomUUID();
      conversations.set(id, {id, documentIds: unique, createdAt: now, updatedAt: now});
      return {
        id,
        documentId: unique[0]!,
        documentIds: unique,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
        preview: null
      };
    },

    async listConversations(documentId, limit = DEFAULT_CONVERSATION_LIMIT) {
      return [...conversations.values()]
        .filter(c => c.documentIds.includes(documentId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map(c => ({
          id: c.id,
          documentId: c.documentIds[0]!,
          documentIds: c.documentIds,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          messageCount: [...messages.values()].filter(m => m.conversationId === c.id).length,
          preview: previewFor(c.id)
        }));
    },

    async listConversationsForDocumentSet(documentIds, limit = DEFAULT_CONVERSATION_LIMIT) {
      const target = [...new Set(documentIds)];
      return [...conversations.values()]
        .filter(c => sameDocumentSet(c.documentIds, target))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map(c => ({
          id: c.id,
          documentId: c.documentIds[0]!,
          documentIds: c.documentIds,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          messageCount: [...messages.values()].filter(m => m.conversationId === c.id).length,
          preview: previewFor(c.id)
        }));
    },

    async getConversation(conversationId, documentId, messageLimit = DEFAULT_MESSAGE_LIMIT) {
      const c = conversations.get(conversationId);
      if (!c || !c.documentIds.includes(documentId)) return null;
      const rows = sortedMessages(conversationId)
        .slice(-messageLimit)
        .map(toStored);
      return {
        id: c.id,
        documentId: c.documentIds[0]!,
        documentIds: c.documentIds,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messages: rows
      };
    },

    async listConversationDocumentIds(conversationId) {
      const c = conversations.get(conversationId);
      return c ? [...c.documentIds] : [];
    },

    async assertConversationDocument(conversationId, documentId) {
      const c = conversations.get(conversationId);
      return Boolean(c && c.documentIds.includes(documentId));
    },

    async assertConversationExactDocuments(conversationId, documentIds) {
      const c = conversations.get(conversationId);
      return Boolean(c && sameDocumentSet(c.documentIds, documentIds));
    },

    async appendUserMessage(conversationId, documentId, content) {
      if (!(await this.assertConversationDocument(conversationId, documentId))) {
        throw new Error("Conversation does not belong to document.");
      }
      const now = new Date().toISOString();
      const msg: MemoryMessage = {
        id: randomUUID(),
        conversationId,
        role: "user",
        content,
        status: "complete",
        cancelRequested: false,
        createdAt: now,
        updatedAt: now,
        seq: ++seqCounter
      };
      messages.set(msg.id, msg);
      citations.set(msg.id, []);
      touchConversation(conversationId);
      return toStored(msg);
    },

    async createAssistantMessage(conversationId, documentId) {
      if (!(await this.assertConversationDocument(conversationId, documentId))) {
        throw new Error("Conversation does not belong to document.");
      }
      const now = new Date().toISOString();
      const msg: MemoryMessage = {
        id: randomUUID(),
        conversationId,
        role: "assistant",
        content: "",
        status: "pending",
        cancelRequested: false,
        createdAt: now,
        updatedAt: now,
        seq: ++seqCounter
      };
      messages.set(msg.id, msg);
      citations.set(msg.id, []);
      touchConversation(conversationId);
      return toStored(msg);
    },

    async markStreaming(messageId) {
      const msg = messages.get(messageId);
      if (!msg || msg.role !== "assistant") return false;
      if (!canTransition(msg.status, "streaming")) return false;
      msg.status = "streaming";
      msg.updatedAt = new Date().toISOString();
      return true;
    },

    async checkpointContent(messageId, content) {
      const msg = messages.get(messageId);
      if (!msg || msg.role !== "assistant") return false;
      if (msg.status !== "pending" && msg.status !== "streaming") return false;
      msg.content = content;
      if (msg.status === "pending") msg.status = "streaming";
      msg.updatedAt = new Date().toISOString();
      touchConversation(msg.conversationId);
      return true;
    },

    async requestCancel(messageId, documentId) {
      const msg = messages.get(messageId);
      if (!msg) return {ok: false, status: null, alreadyTerminal: false};
      const conv = conversations.get(msg.conversationId);
      if (!conv || !conv.documentIds.includes(documentId)) {
        return {ok: false, status: null, alreadyTerminal: false};
      }
      if (isTerminalStatus(msg.status)) {
        return {ok: true, status: msg.status, alreadyTerminal: true};
      }
      msg.cancelRequested = true;
      msg.updatedAt = new Date().toISOString();
      return {ok: true, status: msg.status, alreadyTerminal: false};
    },

    async isCancelRequested(messageId) {
      return Boolean(messages.get(messageId)?.cancelRequested);
    },

    async finalizeAssistant(input: FinalizeAssistantInput) {
      const msg = messages.get(input.messageId);
      if (!msg || msg.role !== "assistant") {
        return {ok: false, status: "failed" as MessageStatus, content: ""};
      }
      if (!(await this.assertConversationDocument(input.conversationId, input.documentId))) {
        return {ok: false, status: msg.status, content: msg.content};
      }
      if (isTerminalStatus(msg.status)) {
        // Idempotent: winner already set.
        return {ok: true, status: msg.status, content: msg.content};
      }
      if (!canTransition(msg.status, input.status)) {
        return {ok: false, status: msg.status, content: msg.content};
      }
      msg.content = input.content;
      msg.status = input.status;
      msg.cancelRequested = msg.cancelRequested || input.status === "stopped";
      msg.updatedAt = new Date().toISOString();
      citations.set(msg.id, mapCitations(msg.id, input.citations ?? []));
      touchConversation(msg.conversationId);
      return {ok: true, status: msg.status, content: msg.content};
    },

    async recoverStaleGenerations(olderThanMs) {
      let count = 0;
      const cutoff = Date.now() - olderThanMs;
      for (const msg of messages.values()) {
        if (msg.role !== "assistant") continue;
        if (msg.status !== "pending" && msg.status !== "streaming") continue;
        if (Date.parse(msg.updatedAt) > cutoff) continue;
        msg.status = "interrupted";
        msg.updatedAt = new Date().toISOString();
        count += 1;
      }
      return count;
    },

    async recoverStaleInConversation(conversationId, olderThanMs) {
      let count = 0;
      const cutoff = Date.now() - olderThanMs;
      for (const msg of messages.values()) {
        if (msg.conversationId !== conversationId || msg.role !== "assistant") continue;
        if (msg.status !== "pending" && msg.status !== "streaming") continue;
        if (Date.parse(msg.updatedAt) > cutoff) continue;
        msg.status = "interrupted";
        msg.updatedAt = new Date().toISOString();
        count += 1;
      }
      return count;
    },

    forceUpdatedAt(messageId, iso) {
      const msg = messages.get(messageId);
      if (msg) msg.updatedAt = iso;
    },

    getRawMessage(messageId) {
      return messages.get(messageId);
    }
  };
}

function mapCitations(messageId: string, list: VerifiedCitation[]): StoredCitation[] {
  return list
    .filter(c => c.verified && c.documentId)
    .map(c => ({
      id: randomUUID(),
      messageId,
      documentId: c.documentId,
      sourceStart: c.startOffset,
      sourceEnd: c.endOffset,
      quote: c.quote,
      occurrenceIndex: c.occurrenceIndex,
      sectionLabel: c.sectionLabel
    }));
}
