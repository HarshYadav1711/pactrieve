# Pactrieve

**Every answer, traceable.**

Evidence-first contract analysis workspace for an SDE engineering assessment.

> **Status: Phase 11 release hardening in working tree (uncommitted — review/commit manually).** Phases 0–10 committed through `7c02bbc`. Public deploys **must** set `PACTRIEVE_ACCESS_TOKEN` (shared evaluator passphrase). Use only synthetic contracts on shared hosts.

## Technology

Next.js (App Router), TypeScript, Supabase Postgres + private Storage, PDF.js, Mammoth, Zod, and a standalone evidence verifier.

## Assignment (authoritative)

Requirements come from **SDE Assignment.pdf**. Traceability and governance live in:

- `AGENTS.md` — Cursor/agent reading order and invariants
- `docs/rules.md` / `PRD.md` / `Architecture.md` / `Design.md` / `phases.md` — product and phase governance
- `docs/ASSIGNMENT_SOURCE.md` — assignment summary and source path
- `docs/REQUIREMENTS_MATRIX.md` — requirement IDs and implementation status
- `docs/PROJECT_CONTEXT.md` — current state and next phase
- `docs/DECISIONS.md` — engineering decisions
- `docs/starter-import/` — original starter README / context preserved at import time

**Part C choice:** Option 2 — agentic document research (Phase 10 implemented; review/commit manually).

> Governance documents are specifications and process controls. They do **not** prove features are implemented. See the requirements matrix for evidence-backed status.

## Requirements

- Node.js 22.16+ (Node 24.x also used for Phase 0 validation)
- A Supabase project and a **private** Storage bucket named `pactrieve-documents`
- Windows PowerShell or any standard terminal

## Local setup

```powershell
cd D:\Fun\pactrieve
Copy-Item .env.example .env.local
npm install
```

1. Open the Supabase SQL editor and execute `db/schema.sql`.
2. In Supabase Storage, create a **private** bucket named `pactrieve-documents`. Raise the per-file size limit if needed (app accepts up to 30 MB).
3. Fill `.env.local` from Supabase project settings. The service role key must **never** appear in client bundles, commit history, or screenshots.
4. Start the app:

```powershell
npm run dev
```

Open http://localhost:3000 .

### Environment variables

| Name | Use |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL available to browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key used only for signed upload requests |
| `SUPABASE_URL` | Server project URL (can match public URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database/storage access. Never expose. |
| `SUPABASE_STORAGE_BUCKET` | Defaults to `pactrieve-documents` |
| `LLM_API_KEY` | Server-only API key for an OpenAI-compatible chat provider |
| `LLM_BASE_URL` | Provider base URL (e.g. `https://api.groq.com/openai/v1`) — no trailing slash required |
| `LLM_MODEL` | Model id supported by that provider |
| `LLM_TIMEOUT_MS`, `LLM_MAX_TOKENS` | Optional (defaults 45000 ms / 1024 tokens) |
| `PACTRIEVE_ACCESS_TOKEN` | **Required on any public URL.** Shared deployment passphrase (not multi-user login). When set, `/api/*` needs Bearer token or unlock cookie from `POST /api/access`. Leave unset for local single-user work. |

The browser uploads via a short-lived signed token from a server route; raw files go to private Storage. After upload, the process API downloads, validates signatures, extracts text, and stores page/offset mapping and retrieval chunks.

**Security note:** Private Supabase Storage does **not** protect Next.js API routes that use the service-role key. Without `PACTRIEVE_ACCESS_TOKEN`, anonymous callers can list/download/delete documents and burn LLM quota. This is intentional for local demos only.

**Limitations:** Processing is synchronous (`maxDuration` 120s on process; agent 90s). Dense commercial PDFs may still need durable workers. Assignment requires no full auth platform — the access token is a shared gate, not accounts.

## Checks

```powershell
npm run typecheck
npm test
npm run build
```

Unit tests need no model key or database. They cover monetary hallucinations, precise words, whitespace normalization, cross-page quotes, repeated quotes, wrong-document scoping, unicode offsets, empty quotes, chunking, PDF text reconstruction, grounded chat streaming, invented evidence IDs, and insufficient-evidence abstention.

## Grounded chat (Phase 3)

Pipeline for a ready document:

1. Validate question (1–2000 chars) and document readiness.
2. Retrieve relevant passages via `retrieveDocument` (not the full contract).
3. Build a **verified evidence registry** (`e1`…) with `verifyQuote` on canonical text.
4. Stream an OpenAI-compatible completion that may cite evidence IDs only.
5. Resolve citations against the registry; reject invented IDs / wrong-document refs.
6. Emit SSE events: `retrieval_started` → `evidence_prepared` → `generation_started` → `answer_delta*` → `citation*` → `completed` | `error`.

If retrieval coverage cannot support an answer, the API abstains with an explicit insufficient-evidence message (a search miss is **not** proof of absence).

Configure `LLM_*` in `.env.local`, then optionally:

```powershell
node --experimental-strip-types scripts/phase3-live-chat.mjs
```

The script loads `.env.local` from the repo root via Node's built-in `process.loadEnvFile` (existing process env vars are preserved for CI/deploy).

## Evidence engine guarantees

`src/lib/evidence/verify.ts`:

1. Builds a canonical concatenation of extracted pages using a single line-break separator.
2. Normalizes whitespace in both quote and source while retaining a map to source offsets.
3. Finds **every** literal match; no fuzzy word/value substitutions.
4. Derives page indices and exact original snippets from canonical source text.
5. Returns unverified if no occurrence exists. Every call scopes to one document.

**Not guaranteed:** Interpretive correctness of a quote; PDF hyphenation merge; glyph/OCR recovery; physical PDF overlay highlighting.

## Current API

| Method | Route | Result |
|---|---|---|
| `GET` | `/api/documents` | Library metadata |
| `POST` | `/api/documents/initiate` | Validates upload request, issues signed upload token |
| `POST` | `/api/documents/:id/process` | Downloads, validates and extracts uploaded file |
| `GET` | `/api/documents/:id/text` | Canonical extracted text and page boundaries |
| `POST` | `/api/documents/:id/verify` | Deterministically checks a proposed quotation |
| `POST` | `/api/documents/:id/chat` | Grounded SSE chat stream (persists conversation/messages) |
| `GET` | `/api/documents/:id/conversations` | List conversations for a document |
| `POST` | `/api/documents/:id/conversations` | Create a new conversation |
| `GET` | `/api/documents/:id/conversations/:cid` | Load messages + citations |
| `POST` | `/api/documents/:id/messages/:mid/stop` | Request Stop (`cancel_requested`) |
| `GET` | `/api/documents/:id/file` | Signed URL (`?redirect=1`) or same-origin file bytes (`?raw=1`) |
| `GET` | `/api/documents/:id/docx-preview` | Safe semantic DOCX preview AST (DOCX only) |
| `DELETE` | `/api/documents/:id` | Removes file and DB record (child rows cascade) |
| `POST` | `/api/research/chat` | Multi-document grounded SSE chat (exact document-set conversations) |
| `GET`/`POST` | `/api/research/conversations` | List/create multi-document conversations (`?docs=` / body `documentIds`) |
| `GET` | `/api/research/conversations/:cid` | Load multi-doc history + citations |
| `POST` | `/api/compare` | Clause/paragraph version comparison (`originalDocumentId`, `revisedDocumentId`) |
| `POST` | `/api/agent/research` | Bounded agentic multi-step research SSE (`documentIds`, `question`) |
| `GET`/`POST` | `/api/agent/conversations` | Agent conversation list/create (`?docs=`) |
| `GET` | `/api/agent/conversations/:cid` | Load agent conversation + citations |

UI routes: `/` library · `/documents/:id` · `/research` · `/compare` · `/agent`

## Finished vs not finished

| Area | Status |
| --- | --- |
| Document upload / extract / library / delete | Phase 1 verified (unit + live Supabase smoke) |
| Deterministic quote verifier + unit tests | Verified |
| Structure-aware retrieval + coverage statuses | Phase 2 verified (unit + live retrieval smoke) |
| Grounded single-document chat + real SSE streaming | Phase 3 verified (unit + live Groq) |
| Stop generation / durable chat history | Phase 4 verified (live A/B/C; Groq Stop timing not proven) |
| PDF citation navigation / highlight | Phase 5 verified (`51fce30`) |
| DOCX semantic preview / citation highlight | Phase 6 VERIFIED (`0253b74`) |
| Multi-document comparative Q&A | Phase 7 VERIFIED (`cfa8140`) |
| Clause-level version comparison (structural) | Phase 8 VERIFIED (`f559ae7`) |
| Substantive change explanations / severity filters | Phase 9 VERIFIED (`025fd88`) |
| Part C agentic document research | Phase 10 implemented (213 tests; live Groq multi-round + browser in phase report) |
| Deployed demo / video / written note | Not started |

## Checks

```powershell
npm run typecheck
npm test
npm run build
# Phase 1 live ingestion (app running):
node --env-file=.env.local scripts/phase1-live-smoke.mjs
# Phase 2 live retrieval (no app required):
node --env-file=.env.local --experimental-strip-types scripts/phase2-live-retrieval.mjs
# Phase 3 live chat (requires LLM_*; loads .env.local automatically):
node --experimental-strip-types scripts/phase3-live-chat.mjs
# Phase 4 live persistence/stop smoke:
node --experimental-strip-types scripts/phase4-live-chat.mjs
# Phase 7 live multi-doc chat (app running + ≥2 ready docs):
node --experimental-strip-types scripts/phase7-live-multidoc.mjs
# Phase 8 live version compare (app running + phase7-alpha/beta ready):
node scripts/phase8-live-compare.mjs
# Phase 9 live significance (+ optional Groq enrich):
node scripts/phase9-live-significance.mjs
# Phase 10 live agent research (app running + Groq tool calling + ≥2 ready docs):
node scripts/phase10-live-agent.mjs
```

Optional SQL helpers in Supabase:

- `db/migrations/20261008_phase2_search_helper.sql` — FTS candidate helper
- `db/migrations/20261008_phase4_chat_persistence.sql` — chat status/cancel columns (**required for Phase 4 live history**)

## Next milestones

1. Review/commit Phase 11 (`test: harden contract analysis and evidence workflows` or similar).
2. Phase 12 — live deploy with `PACTRIEVE_ACCESS_TOKEN` set; evaluator smoke on the public URL.
3. Phase 13 — screenshots, demo video, technical note.

Release audit: `docs/PHASE11_RELEASE_AUDIT.md`.

`postinstall` copies `pdfjs-dist` worker → `public/pdf.worker.min.mjs` (gitignored; no CDN).

## Security

- Never store API keys in Git (`.env*` ignored except `.env.example`).
- `LLM_*` and Supabase service role stay server-side only.
- Private Storage for originals; HTTP routes have no auth by assignment design.
- Contract text is untrusted data (prompt-injection delimiters); magic signatures checked after upload.
- Production hardening (ZIP bombs, malware, rate limits, durable retries) still required.
