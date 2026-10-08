# Pactrieve
**Every answer, traceable.**

Evidence-first contract analysis workspace for an SDE engineering assessment.

> **Status: Phase 1 foundation.** Not a completed assessment submission. Upload, storage, extraction, document listing/deletion, extracted-text preview and deterministic quote verification are implemented. They require Supabase setup and full integration testing. AI chat, answer streaming/cancellation, PDF page-overlay highlights, multi-document Q&A, comparison and agentic tools are **not implemented yet**. Do not claim otherwise.

## Technology
Next.js (App Router), TypeScript, Supabase Postgres + private Storage, PDF.js, Mammoth and a standalone evidence verifier.

## Requirements
- Node.js 22.16+ (recommended for built-in TypeScript unit tests)
- A Supabase project and a **private** Storage bucket named `pactrieve-documents`
- Windows PowerShell or any standard terminal

## Local setup

```powershell
# Unzip pactrieve-starter.zip, then open the pactrieve-starter folder
cd pactrieve-starter
Copy-Item .env.example .env.local
npm install
```

1. Open the Supabase SQL editor and execute `db/schema.sql`.
2. In Supabase Storage, create a **private** bucket named `pactrieve-documents`. Increase the bucket's per-file size limit if necessary (the app accepts up to 30 MB).
3. Fill `.env.local` from your Supabase project settings. The service role key must **never** be included in client-side code, commit history or screenshots.
4. Start the app:

```powershell
npm run dev
```

Open http://localhost:3000 .

### Environment variables

| Name | Use |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL available to browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable/anon key used only for signed upload requests |
| `SUPABASE_URL` | Server project URL (can match public URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database/storage access. Never expose. |
| `SUPABASE_STORAGE_BUCKET` | Defaults to `pactrieve-documents` |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Reserved for the next phase; not used yet |

The browser's upload path uses a short-lived signed token issued by a server route; raw files go directly to private Storage. After upload, the API downloads and extracts text and stores page/offset mapping and retrieval chunks.

**Limitations:** Processing currently runs synchronously in a Next.js request with a maximum duration of 60 seconds. A production-quality durable job worker is required if we hit timeouts or restarts, especially for large files. Supabase supports resumable TUS uploads for larger files; this build currently uses a signed standard upload. Authentication is intentionally omitted per assignment, so the deployed evaluator instance must use **synthetic/non-confidential** contracts only.

## Test evidence verifier

```powershell
npm test
```

This requires no external model key or database. The sixteen unit tests cover monetary hallucinations, precise words, whitespace normalization, cross-page quotes, repeated quotes, wrong-document quotes, unicode offsets and empty quotation handling.

## What the evidence engine actually guarantees

`src/lib/evidence/verify.ts`:
1. Builds a canonical concatenation of extracted pages using a single line-break separator.
2. Normalizes whitespace in both quote and source while retaining a map to source offsets.
3. Finds **every** literal match; no fuzzy word/value substitutions are allowed.
4. Derives page indices and exact original snippets from canonical source text.
5. Returns unverified if no occurrence exists. Every call scopes to one document.

**Not guaranteed:** A literal quote does not necessarily support a model's interpretation of it. The implementation also does not currently merge discretionary PDF hyphenation or reconcile glyph/text-extraction errors; OCR is not implemented. Repeated quotes require occurrence disambiguation. Physical PDF overlay highlighting is not part of Phase 1.

## Current API

| Method | Route | Result |
|---|---|---|
| `GET` | `/api/documents` | Library metadata |
| `POST` | `/api/documents/initiate` | Validates upload request, issues signed upload token |
| `POST` | `/api/documents/:id/process` | Downloads, validates and extracts uploaded file |
| `GET` | `/api/documents/:id/text` | Canonical extracted text and page boundaries |
| `POST` | `/api/documents/:id/verify` | Deterministically checks a proposed quotation |
| `GET` | `/api/documents/:id/file` | Short-lived signed original-file URL |
| `DELETE` | `/api/documents/:id` | Removes file and DB record (child rows cascade) |

## Next implementation milestones
1. Real streaming LLM chat, persisted messages and cancellation that retains partial content.
2. Retrieval against `document_chunks` with explicit coverage and abstention rules for 150-page contracts.
3. Citation navigation/highlighting in rendered PDF text layers and DOCX preview, including repeated and cross-page spans.
4. Cross-document questions and verified per-document citations.
5. Clause-level comparison with substantive change descriptions and significance filters.
6. Part C Option 2: multi-round agent tool calls, UI activity events, tool argument validation and round caps.
7. Adversarial, integration and end-to-end tests, deployment checks, screenshots, demo video and written note.

## Security and assessment honesty
- Never store API keys in Git.
- Original files live in private Storage, but HTTP routes intentionally have no authentication because the assignment requires a single user without login. Anyone with access to the deployed demo can interact with its contents. Use only synthetic/evaluation files.
- File signatures are checked after upload, but production file upload hardening (ZIP-bomb safeguards, advanced malware screening, rate limiting and durable job retries) is still required.
- No live-deployment, npm-install or end-to-end integration claims until these checks have actually passed.

## Engineering note
See `docs/DECISIONS.md` for scope and tradeoffs and `docs/PROJECT_CONTEXT.md` to continue implementation without losing state.
