import {serverSupabase} from "../../supabase/server.ts";
import {
  canTransition,
  DEFAULT_CONVERSATION_LIMIT,
  DEFAULT_MESSAGE_LIMIT,
  isTerminalStatus,
  STALE_GENERATION_MS,
  type ConversationDetail,
  type ConversationStore,
  type ConversationSummary,
  type FinalizeAssistantInput,
  type MessageStatus,
  type StoredCitation,
  type StoredMessage
} from "./types.ts";

type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  status: MessageStatus;
  cancel_requested: boolean;
  created_at: string;
  updated_at: string;
};

type CitationRow = {
  id: string;
  message_id: string;
  document_id: string;
  source_start: number;
  source_end: number;
  quote: string;
  occurrence_index: number;
  section_label: string | null;
};

function mapMessage(row: MessageRow, cites: StoredCitation[] = []): StoredMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    cancelRequested: row.cancel_requested,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    citations: cites
  };
}

function mapCitation(row: CitationRow): StoredCitation {
  return {
    id: row.id,
    messageId: row.message_id,
    documentId: row.document_id,
    sourceStart: row.source_start,
    sourceEnd: row.source_end,
    quote: row.quote,
    occurrenceIndex: row.occurrence_index,
    sectionLabel: row.section_label
  };
}

async function touchConversation(conversationId: string) {
  const db = serverSupabase();
  await db.from("conversations").update({updated_at: new Date().toISOString()}).eq("id", conversationId);
}

function sameDocumentSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

export function createSupabaseConversationStore(): ConversationStore {
  return {
    async createConversation(documentId) {
      return this.createConversationForDocuments([documentId]);
    },

    async createConversationForDocuments(documentIds) {
      const unique = [...new Set(documentIds.map(id => id.trim()).filter(Boolean))];
      if (!unique.length) throw new Error("At least one document ID is required.");
      const db = serverSupabase();
      const {data: conversation, error} = await db
        .from("conversations")
        .insert({})
        .select("id,created_at,updated_at")
        .single();
      if (error || !conversation) throw error ?? new Error("Failed to create conversation.");
      const {error: linkError} = await db.from("conversation_documents").insert(
        unique.map(document_id => ({
          conversation_id: conversation.id,
          document_id
        }))
      );
      if (linkError) throw linkError;
      return {
        id: conversation.id,
        documentId: unique[0]!,
        documentIds: unique,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        messageCount: 0,
        preview: null
      };
    },

    async listConversations(documentId, limit = DEFAULT_CONVERSATION_LIMIT) {
      const db = serverSupabase();
      const {data: links, error} = await db
        .from("conversation_documents")
        .select("conversation_id, conversations!inner(id,created_at,updated_at)")
        .eq("document_id", documentId)
        .order("conversations(updated_at)", {ascending: false})
        .limit(limit);
      if (error) {
        // Fallback without nested order if PostgREST join ordering is unavailable.
        const {data: plain, error: plainError} = await db
          .from("conversation_documents")
          .select("conversation_id")
          .eq("document_id", documentId)
          .limit(limit);
        if (plainError) throw plainError;
        const ids = (plain ?? []).map(r => r.conversation_id);
        if (!ids.length) return [];
        const {data: convs, error: convError} = await db
          .from("conversations")
          .select("id,created_at,updated_at")
          .in("id", ids)
          .order("updated_at", {ascending: false});
        if (convError) throw convError;
        return Promise.all(
          (convs ?? []).map(async c => {
            const {count} = await db
              .from("messages")
              .select("id", {count: "exact", head: true})
              .eq("conversation_id", c.id);
            const {data: last} = await db
              .from("messages")
              .select("content")
              .eq("conversation_id", c.id)
              .order("created_at", {ascending: false})
              .limit(1)
              .maybeSingle();
            return {
              id: c.id,
              documentId,
              createdAt: c.created_at,
              updatedAt: c.updated_at,
              messageCount: count ?? 0,
              preview: last?.content ? String(last.content).slice(0, 120) : null
            } satisfies ConversationSummary;
          })
        );
      }

      const rows = links ?? [];
      const out: ConversationSummary[] = [];
      for (const row of rows) {
        const conv = row.conversations as unknown as {id: string; created_at: string; updated_at: string};
        if (!conv?.id) continue;
        const {count} = await db
          .from("messages")
          .select("id", {count: "exact", head: true})
          .eq("conversation_id", conv.id);
        const {data: last} = await db
          .from("messages")
          .select("content")
          .eq("conversation_id", conv.id)
          .order("created_at", {ascending: false})
          .limit(1)
          .maybeSingle();
        out.push({
          id: conv.id,
          documentId,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
          messageCount: count ?? 0,
          preview: last?.content ? String(last.content).slice(0, 120) : null
        });
      }
      return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async listConversationsForDocumentSet(documentIds, limit = DEFAULT_CONVERSATION_LIMIT) {
      const target = [...new Set(documentIds)];
      if (!target.length) return [];
      const db = serverSupabase();
      // Candidate conversations that include the first document, then filter to exact set.
      const {data: links, error} = await db
        .from("conversation_documents")
        .select("conversation_id")
        .eq("document_id", target[0]!);
      if (error) throw error;
      const candidateIds = [...new Set((links ?? []).map(r => r.conversation_id as string))];
      const matched: ConversationSummary[] = [];
      for (const conversationId of candidateIds) {
        const ids = await this.listConversationDocumentIds(conversationId);
        if (!sameDocumentSet(ids, target)) continue;
        const {data: conv} = await db
          .from("conversations")
          .select("id,created_at,updated_at")
          .eq("id", conversationId)
          .maybeSingle();
        if (!conv) continue;
        const {count} = await db
          .from("messages")
          .select("id", {count: "exact", head: true})
          .eq("conversation_id", conversationId);
        const {data: last} = await db
          .from("messages")
          .select("content")
          .eq("conversation_id", conversationId)
          .order("created_at", {ascending: false})
          .limit(1)
          .maybeSingle();
        matched.push({
          id: conv.id,
          documentId: ids[0]!,
          documentIds: ids,
          createdAt: conv.created_at,
          updatedAt: conv.updated_at,
          messageCount: count ?? 0,
          preview: last?.content ? String(last.content).slice(0, 120) : null
        });
      }
      return matched.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
    },

    async getConversation(conversationId, documentId, messageLimit = DEFAULT_MESSAGE_LIMIT) {
      if (!(await this.assertConversationDocument(conversationId, documentId))) return null;
      await this.recoverStaleInConversation(conversationId, STALE_GENERATION_MS);
      const db = serverSupabase();
      const {data: conv, error} = await db
        .from("conversations")
        .select("id,created_at,updated_at")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      if (!conv) return null;

      const documentIds = await this.listConversationDocumentIds(conversationId);

      const {data: msgRows, error: msgError} = await db
        .from("messages")
        .select("id,conversation_id,role,content,status,cancel_requested,created_at,updated_at")
        .eq("conversation_id", conversationId)
        .order("created_at", {ascending: true})
        .limit(messageLimit);
      if (msgError) throw msgError;

      const messageIds = (msgRows ?? []).map(m => m.id);
      let citeRows: CitationRow[] = [];
      if (messageIds.length) {
        const {data: cites, error: citeError} = await db
          .from("citations")
          .select("id,message_id,document_id,source_start,source_end,quote,occurrence_index,section_label")
          .in("message_id", messageIds);
        if (citeError) throw citeError;
        citeRows = (cites ?? []) as CitationRow[];
      }
      const byMessage = new Map<string, StoredCitation[]>();
      for (const row of citeRows) {
        const list = byMessage.get(row.message_id) ?? [];
        list.push(mapCitation(row));
        byMessage.set(row.message_id, list);
      }

      const messages: StoredMessage[] = ((msgRows ?? []) as MessageRow[]).map(row =>
        mapMessage(row, byMessage.get(row.id) ?? [])
      );

      return {
        id: conv.id,
        documentId: documentIds[0] ?? documentId,
        documentIds,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        messages
      } satisfies ConversationDetail;
    },

    async listConversationDocumentIds(conversationId) {
      const db = serverSupabase();
      const {data, error} = await db
        .from("conversation_documents")
        .select("document_id")
        .eq("conversation_id", conversationId);
      if (error) throw error;
      return (data ?? []).map(r => r.document_id as string);
    },

    async assertConversationDocument(conversationId, documentId) {
      const db = serverSupabase();
      const {data, error} = await db
        .from("conversation_documents")
        .select("conversation_id")
        .eq("conversation_id", conversationId)
        .eq("document_id", documentId)
        .maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },

    async assertConversationExactDocuments(conversationId, documentIds) {
      const linked = await this.listConversationDocumentIds(conversationId);
      return sameDocumentSet(linked, documentIds);
    },

    async appendUserMessage(conversationId, documentId, content) {
      if (!(await this.assertConversationDocument(conversationId, documentId))) {
        throw new Error("Conversation does not belong to document.");
      }
      const db = serverSupabase();
      const {data, error} = await db
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role: "user",
          content,
          status: "complete"
        })
        .select("id,conversation_id,role,content,status,cancel_requested,created_at,updated_at")
        .single();
      if (error || !data) throw error ?? new Error("Failed to save user message.");
      await touchConversation(conversationId);
      return mapMessage(data as MessageRow);
    },

    async createAssistantMessage(conversationId, documentId) {
      if (!(await this.assertConversationDocument(conversationId, documentId))) {
        throw new Error("Conversation does not belong to document.");
      }
      const db = serverSupabase();
      const {data, error} = await db
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role: "assistant",
          content: "",
          status: "pending"
        })
        .select("id,conversation_id,role,content,status,cancel_requested,created_at,updated_at")
        .single();
      if (error || !data) throw error ?? new Error("Failed to create assistant message.");
      await touchConversation(conversationId);
      return mapMessage(data as MessageRow);
    },

    async markStreaming(messageId) {
      const db = serverSupabase();
      const {data: current, error} = await db
        .from("messages")
        .select("status")
        .eq("id", messageId)
        .maybeSingle();
      if (error || !current) return false;
      if (!canTransition(current.status as MessageStatus, "streaming")) return false;
      const {error: updateError} = await db
        .from("messages")
        .update({status: "streaming", updated_at: new Date().toISOString()})
        .eq("id", messageId)
        .in("status", ["pending", "streaming"]);
      return !updateError;
    },

    async checkpointContent(messageId, content) {
      const db = serverSupabase();
      const {data: current, error} = await db
        .from("messages")
        .select("status,conversation_id")
        .eq("id", messageId)
        .maybeSingle();
      if (error || !current) return false;
      if (current.status !== "pending" && current.status !== "streaming") return false;
      const {error: updateError} = await db
        .from("messages")
        .update({
          content,
          status: "streaming",
          updated_at: new Date().toISOString()
        })
        .eq("id", messageId)
        .in("status", ["pending", "streaming"]);
      if (updateError) return false;
      await touchConversation(current.conversation_id);
      return true;
    },

    async requestCancel(messageId, documentId) {
      const db = serverSupabase();
      const {data: msg, error} = await db
        .from("messages")
        .select("id,status,conversation_id")
        .eq("id", messageId)
        .maybeSingle();
      if (error || !msg) return {ok: false, status: null, alreadyTerminal: false};
      const scoped = await this.assertConversationDocument(msg.conversation_id, documentId);
      if (!scoped) return {ok: false, status: null, alreadyTerminal: false};
      const status = msg.status as MessageStatus;
      if (isTerminalStatus(status)) {
        return {ok: true, status, alreadyTerminal: true};
      }
      const {error: updateError} = await db
        .from("messages")
        .update({cancel_requested: true, updated_at: new Date().toISOString()})
        .eq("id", messageId)
        .in("status", ["pending", "streaming"]);
      if (updateError) return {ok: false, status, alreadyTerminal: false};
      return {ok: true, status, alreadyTerminal: false};
    },

    async isCancelRequested(messageId) {
      const db = serverSupabase();
      const {data, error} = await db
        .from("messages")
        .select("cancel_requested")
        .eq("id", messageId)
        .maybeSingle();
      if (error || !data) return false;
      return Boolean(data.cancel_requested);
    },

    async finalizeAssistant(input: FinalizeAssistantInput) {
      const db = serverSupabase();
      const {data: msg, error} = await db
        .from("messages")
        .select("id,status,content,conversation_id,role")
        .eq("id", input.messageId)
        .maybeSingle();
      if (error || !msg || msg.role !== "assistant") {
        return {ok: false, status: "failed", content: ""};
      }
      if (!(await this.assertConversationDocument(input.conversationId, input.documentId))) {
        return {ok: false, status: msg.status as MessageStatus, content: msg.content};
      }
      const current = msg.status as MessageStatus;
      if (isTerminalStatus(current)) {
        return {ok: true, status: current, content: msg.content};
      }
      if (!canTransition(current, input.status)) {
        return {ok: false, status: current, content: msg.content};
      }

      const patch: Record<string, unknown> = {
        content: input.content,
        status: input.status,
        updated_at: new Date().toISOString()
      };
      if (input.status === "stopped") patch.cancel_requested = true;
      const {data: updated, error: updateError} = await db
        .from("messages")
        .update(patch)
        .eq("id", input.messageId)
        .in("status", ["pending", "streaming"])
        .select("status,content")
        .maybeSingle();

      if (updateError) {
        return {ok: false, status: current, content: msg.content};
      }
      if (!updated) {
        // Lost race — reload winner.
        const {data: winner} = await db
          .from("messages")
          .select("status,content")
          .eq("id", input.messageId)
          .single();
        return {
          ok: true,
          status: (winner?.status as MessageStatus) ?? current,
          content: winner?.content ?? msg.content
        };
      }

      // Replace citations only when this finalize won the race.
      // Each citation keeps its own document_id (required for multi-document answers).
      await db.from("citations").delete().eq("message_id", input.messageId);
      const linkedDocs = await this.listConversationDocumentIds(input.conversationId);
      const linked = new Set(linkedDocs);
      const cites = (input.citations ?? []).filter(
        c => c.verified && linked.has(c.documentId)
      );
      if (cites.length) {
        const rows = cites.map(c => ({
          message_id: input.messageId,
          document_id: c.documentId,
          source_start: c.startOffset,
          source_end: c.endOffset,
          quote: c.quote,
          occurrence_index: c.occurrenceIndex,
          section_label: c.sectionLabel
        }));
        const {error: citeError} = await db.from("citations").insert(rows);
        if (citeError) throw citeError;
      }
      await touchConversation(input.conversationId);
      return {
        ok: true,
        status: updated.status as MessageStatus,
        content: updated.content
      };
    },

    async recoverStaleGenerations(olderThanMs) {
      const db = serverSupabase();
      const cutoff = new Date(Date.now() - olderThanMs).toISOString();
      const {data, error} = await db
        .from("messages")
        .update({status: "interrupted", updated_at: new Date().toISOString()})
        .in("status", ["pending", "streaming"])
        .lt("updated_at", cutoff)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },

    async recoverStaleInConversation(conversationId, olderThanMs) {
      const db = serverSupabase();
      const cutoff = new Date(Date.now() - olderThanMs).toISOString();
      const {data, error} = await db
        .from("messages")
        .update({status: "interrupted", updated_at: new Date().toISOString()})
        .eq("conversation_id", conversationId)
        .in("status", ["pending", "streaming"])
        .lt("updated_at", cutoff)
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    }
  };
}
