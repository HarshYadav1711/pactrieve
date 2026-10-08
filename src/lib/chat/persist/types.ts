import {z} from "zod";
import type {VerifiedCitation} from "../types.ts";

/** Database / API message lifecycle. Terminal: complete | stopped | failed | interrupted. */
export const messageStatusSchema = z.enum([
  "pending",
  "streaming",
  "complete",
  "stopped",
  "failed",
  "interrupted"
]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

export const TERMINAL_MESSAGE_STATUSES: ReadonlySet<MessageStatus> = new Set([
  "complete",
  "stopped",
  "failed",
  "interrupted"
]);

export function isTerminalStatus(status: MessageStatus): boolean {
  return TERMINAL_MESSAGE_STATUSES.has(status);
}

/** Allowed transitions. Late completion must not overwrite stopped/failed/interrupted. */
export const STATUS_TRANSITIONS: Record<MessageStatus, ReadonlySet<MessageStatus>> = {
  pending: new Set(["streaming", "stopped", "failed", "interrupted", "complete"]),
  streaming: new Set(["complete", "stopped", "failed", "interrupted"]),
  complete: new Set(),
  stopped: new Set(),
  failed: new Set(),
  interrupted: new Set()
};

export function canTransition(from: MessageStatus, to: MessageStatus): boolean {
  if (from === to) return true; // idempotent no-op
  return STATUS_TRANSITIONS[from].has(to);
}

export interface ConversationSummary {
  id: string;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string | null;
}

export interface StoredCitation {
  id: string;
  messageId: string;
  documentId: string;
  sourceStart: number;
  sourceEnd: number;
  quote: string;
  occurrenceIndex: number;
  sectionLabel: string | null;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
  citations: StoredCitation[];
}

export interface ConversationDetail {
  id: string;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

export interface FinalizeAssistantInput {
  messageId: string;
  conversationId: string;
  documentId: string;
  status: Extract<MessageStatus, "complete" | "stopped" | "failed" | "interrupted">;
  content: string;
  citations?: VerifiedCitation[];
}

export interface ConversationStore {
  createConversation(documentId: string): Promise<ConversationSummary>;
  listConversations(documentId: string, limit?: number): Promise<ConversationSummary[]>;
  getConversation(conversationId: string, documentId: string, messageLimit?: number): Promise<ConversationDetail | null>;
  assertConversationDocument(conversationId: string, documentId: string): Promise<boolean>;
  appendUserMessage(conversationId: string, documentId: string, content: string): Promise<StoredMessage>;
  createAssistantMessage(conversationId: string, documentId: string): Promise<StoredMessage>;
  markStreaming(messageId: string): Promise<boolean>;
  checkpointContent(messageId: string, content: string): Promise<boolean>;
  requestCancel(messageId: string, documentId: string): Promise<{ok: boolean; status: MessageStatus | null; alreadyTerminal: boolean}>;
  isCancelRequested(messageId: string): Promise<boolean>;
  finalizeAssistant(input: FinalizeAssistantInput): Promise<{ok: boolean; status: MessageStatus; content: string}>;
  recoverStaleGenerations(olderThanMs: number): Promise<number>;
  recoverStaleInConversation(conversationId: string, olderThanMs: number): Promise<number>;
}

export const DEFAULT_MESSAGE_LIMIT = 80;
export const DEFAULT_CONVERSATION_LIMIT = 30;
export const STALE_GENERATION_MS = 2 * 60 * 1000;
export const CHECKPOINT_MIN_CHARS = 400;
export const CHECKPOINT_MIN_MS = 800;
