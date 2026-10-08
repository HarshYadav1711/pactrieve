# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

## Phase 0 continuation (2026-10-08)

- Repository previously held Git init + Phase 0 docs only (`ASSIGNMENT_SOURCE.md`, `REQUIREMENTS_MATRIX.md`, early context/decisions).
- Starter imported from `C:\Users\harsh\Downloads\Pactrieve_Phase1_Starter.zip` into `D:\Fun\pactrieve` without replacing `.git`.
- Original starter docs preserved under `docs/starter-import/`.
- Application code now present: Next.js UI, document APIs, extraction, verifier, unit tests, `db/schema.sql`.

## Current implementation

- Next.js TS UI: library upload/list/delete, document text inspector, quotation verification lab.
- Supabase schema, private signed-upload flow, post-upload extraction, PDF and DOCX parsing, page offsets and overlapping retrieval chunks.
- Deterministic quote verification module and Node unit tests.
- No LLM, chat, PDF text-layer highlighting, cross-document QA, comparison, agent tools, or deployment verified in this environment.
- Live Supabase integration is **blocked** until `.env.local` credentials exist.

## Code map

- `src/lib/evidence/verify.ts` — canonical text mapping + quote match algorithm.
- `src/lib/documents/{extract,chunks,validate,load,pdf-text}.ts` — parsing, reconstruction, chunking, validation, loading.
- `src/app/api/documents/**` — create, process, list, view, verify, delete.
- `src/app/page.tsx` — library client.
- `src/app/documents/[id]/page.tsx` — inspector client.
- `db/schema.sql` — Postgres schema, reserved conversation/citation entities.
- `tests/*.test.mts` — evidence, chunks, pdf-text tests.

## Phase boundaries

- **Phase 0:** Import starter, preserve docs, validate install/typecheck/test/build, audit foundation, update matrix — no new feature work beyond blockers.
- **Phase 1+:** Harden ingestion as needed, then chat/streaming, retrieval, highlighting, multi-doc, comparison, Part C.

## Next immediate steps

1. Configure Supabase per README; run browser smoke tests (PDF, DOCX, scanned empty PDF).
2. Upgrade PDF spacing/layout reconstruction where live files fail; confirm verifier offsets.
3. Implement streaming chat + persistence + cancel.
4. Retrieval and abstention before large-context claims.
5. Highlighting, multi-doc, comparison, Part C Option 2, deploy, demo.

## Ground rules

No API secrets in repo, no fictional test results, no pretending unfinished features exist, no trusting model-provided source locations.
