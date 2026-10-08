-- Phase 4: durable chat lifecycle (additive, non-destructive).
-- Apply in Supabase SQL editor after db/schema.sql.
-- Rollback notes: drop added columns/indexes; restore prior messages_status_check if needed.
-- Does not delete conversations, messages, or citations.

-- Expand message status vocabulary for pending/interrupted while preserving existing values.
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages
  add constraint messages_status_check
  check (status in ('pending','streaming','complete','stopped','failed','interrupted'));

alter table public.messages
  add column if not exists cancel_requested boolean not null default false;

alter table public.messages
  add column if not exists updated_at timestamptz not null default now();

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at asc);

create index if not exists messages_streaming_updated_idx
  on public.messages(status, updated_at)
  where status in ('pending','streaming');

-- Optional section label for restored citation cards (nullable; offsets remain authoritative).
alter table public.citations
  add column if not exists section_label text;

create index if not exists conversation_documents_document_idx
  on public.conversation_documents(document_id);
