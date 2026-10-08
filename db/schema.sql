-- Run in Supabase SQL Editor. Demo is intentionally single-user, without authentication.
-- Keep this instance for synthetic/evaluation contracts; do not use for confidential production legal work.
create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 31457280),
  storage_path text not null unique,
  status text not null default 'uploading' check (status in ('uploading','processing','ready','failed')),
  error_code text,
  error_message text,
  page_count integer,
  unreadable_page_count integer not null default 0,
  char_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_created_idx on public.documents(created_at desc);

create table if not exists public.document_pages (
  document_id uuid not null references public.documents(id) on delete cascade,
  page_index integer not null check (page_index >= 0),
  content text not null,
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset >= start_offset),
  primary key(document_id, page_index)
);

create table if not exists public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  start_offset integer not null,
  end_offset integer not null,
  content text not null,
  search_vector tsvector generated always as (to_tsvector('simple', content)) stored,
  unique(document_id, chunk_index)
);
create index if not exists document_chunks_fts_idx on public.document_chunks using gin(search_vector);
create index if not exists document_chunks_doc_idx on public.document_chunks(document_id);

-- Reserved for the next implementation phase. These tables are not yet wired to chat endpoints.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.conversation_documents (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  primary key(conversation_id, document_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null default '',
  status text not null default 'complete' check (status in ('streaming','complete','stopped','failed')),
  created_at timestamptz not null default now()
);
create table if not exists public.citations (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  source_start integer not null,
  source_end integer not null,
  quote text not null,
  occurrence_index integer not null default 0,
  created_at timestamptz not null default now()
);

-- No public RLS policies. Server routes use the service role in this assessment-only build.
alter table public.documents enable row level security;
alter table public.document_pages enable row level security;
alter table public.document_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_documents enable row level security;
alter table public.messages enable row level security;
alter table public.citations enable row level security;
