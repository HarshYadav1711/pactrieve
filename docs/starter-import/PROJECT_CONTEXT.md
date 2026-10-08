# Pactrieve: continuation context

Date: October 8, 2026. Assignment: six-page SDE legal-contract web app, 3-day deadline from Oct 7 at 9:42 PM IST. Most important requirement: independently verified quotes, exact source highlighting. Parts A and B required; choose C; selected C Option 2 agentic document research. Next.js preferred.

## Current implementation
- Next.js TS UI: library upload/list/delete, document text inspector and a quotation verification lab.
- Supabase schema, private signed-upload flow, post-upload extraction, PDF and DOCX parsing, page offsets and overlapping retrieval chunks.
- Deterministic quote verification module and sixteen Node tests. Tests passed using Node 22 built-in TS type stripping.
- No LLM, chat, PDF text-layer highlighting, cross-document QA, comparison, agent tools or deployment.

## Code map
- `src/lib/evidence/verify.ts` — canonical text mapping + quote match algorithm.
- `src/lib/documents/{extract,chunks,validate,load}.ts` — parsing, source chunking, validation and loading.
- `src/app/api/documents/**` — create, process, list, view, verify, delete.
- `src/app/page.tsx` — library client.
- `src/app/documents/[id]/page.tsx` — inspector client.
- `db/schema.sql` — Postgres schema, reserved conversation/citation entities.
- `tests/evidence.test.mts` — deterministic tests.

## Next immediate steps
1. Configure Supabase using README. Install dependencies and fix any typecheck/build issues. Run browser smoke tests with PDFs and DOCX including a scanned sample. Do not declare Phase 1 complete until this passes.
2. Upgrade PDF text extraction with position-aware spacing where needed; confirm canonical quote verification on real files.
3. Implement persistent conversation and proper streaming/cancel with a provider adapter.
4. Implement retrieval and abstention rules before large-context claims.
5. Build PDF.js text-layer highlighting, multiple-occurrence selection, page-crossing mapping; DOCX semantic viewer.
6. Implement multi-doc QA, clause-level comparison, Part C tools, evaluations, deployment and demo.

## Ground rules
No API secrets in repo, no fictional screenshots or tests, no pretending unfinished features exist, no arbitrary model-provided source locations. Keep modular architectural boundaries and update this file after each verified milestone.
