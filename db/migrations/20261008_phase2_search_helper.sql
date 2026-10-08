-- Optional Phase 2 helper. Additive only; safe to re-run.
-- Application falls back to in-memory / table scans if this function is absent.
create or replace function public.pactrieve_search_chunks(
  p_document_id uuid,
  p_tsquery text,
  p_limit integer default 20
)
returns table (
  id bigint,
  chunk_index integer,
  start_offset integer,
  end_offset integer,
  content text,
  rank real
)
language sql
stable
as $$
  select
    c.id,
    c.chunk_index,
    c.start_offset,
    c.end_offset,
    c.content,
    ts_rank(c.search_vector, to_tsquery('simple', p_tsquery)) as rank
  from public.document_chunks c
  where c.document_id = p_document_id
    and c.search_vector @@ to_tsquery('simple', p_tsquery)
  order by rank desc, c.chunk_index asc
  limit greatest(1, least(coalesce(p_limit, 20), 40));
$$;

revoke all on function public.pactrieve_search_chunks(uuid, text, integer) from public;
-- Service role used by the Next.js server bypasses RLS; no broad grants required for the anon role.
