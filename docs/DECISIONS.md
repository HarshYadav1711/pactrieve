# Engineering decisions

## 2026-10-08 — Governance pack adoption (docs-only)

- **Decision:** Import `Pactrieve_Governance_Pack.zip` into the repo as `AGENTS.md` plus `docs/{rules,PRD,Architecture,Design,phases}.md` (and preserve pack `INSTALL_NOTES.md` under `docs/`).
- **Decision:** Cursor/agent reading order is defined in root `AGENTS.md` (rules → PRD → Architecture → Design → phases → PROJECT_CONTEXT → DECISIONS → REQUIREMENTS_MATRIX → ASSIGNMENT_SOURCE).
- **Decision:** Employer assignment PDF remains highest authority for *what* must be built; governance docs control *how* and phase gates where they do not contradict the assignment.
- **Open for review:** `rules.md` §1 lists reading assignment / `ASSIGNMENT_SOURCE` / `PROJECT_CONTEXT` before `rules.md`, while `AGENTS.md` starts with `rules.md` per integration instructions. Conflict resolution order still places the assignment PDF first; reading-order meta-difference left documented rather than silently rewriting `rules.md`.
- **Open for review:** Earlier coarse “Phase 1+” labels in historical notes differ from the finer `phases.md` roadmap (Phase 1 ingestion … Phase 13 handoff). Adopt `phases.md` going forward; do not rewrite historical matrix phase columns without a dedicated status pass.

## 2026-10-08 — Requirements authority (preserved from early Phase 0)

- **Decision:** Treat `C:\Users\harsh\Downloads\SDE Assignment.pdf` as the authoritative feature and submission checklist.
- **Decision:** Treat the Pactrieve engineering brief (Supabase stack, file layout) as implementation guidance.
- **Decision:** Part C target is **Option 2 (agentic document research)**; not started until Parts A/B foundations exist.

## 2026-10-08 — Repository baseline then starter import

- **Observation:** Initial workspace had Git on `main` with no commits and docs-only content; starter was missing.
- **Decision:** Import `Pactrieve_Phase1_Starter.zip` into the existing repo; preserve `.git`, `docs/ASSIGNMENT_SOURCE.md`, and `docs/REQUIREMENTS_MATRIX.md`.
- **Decision:** Preserve pre-import and starter documentation by merging README / PROJECT_CONTEXT / DECISIONS and storing unmodified starter copies under `docs/starter-import/`.
- **Decision:** Do not scaffold a second Next.js app.

## Objective (from starter)

Build a reliable single-user legal-contract workspace for a three-day SDE assignment. Internal target: complete earlier than the absolute deadline.

## Product philosophy

The original source is authoritative; the LLM is not. No model-suggested offsets or page numbers are accepted as verification. Verified literal source text is necessary but not sufficient to guarantee an answer's interpretation is correct.

## Choice of Part C

Option 2, agentic document research. It shares retrieval, section navigation, bounded execution and evidence verification primitives with required Parts A and B. Genuine multi-round tools and transparent activity events are required; hardcoded fake activity does not count.

## Why direct signed uploads

Browser-to-storage uploads avoid request payload ceilings in serverless hosts. The browser's token cannot grant arbitrary server database access. Post-upload process route validates magic signatures and extractability before marking ready. For larger files, replace the standard signed upload with resumable signed TUS.

## Canonical text and citation positions

PDF pages are extracted independently and joined with a single newline. Source offsets are UTF-16 JavaScript string offsets, not PDF byte offsets. This makes deterministic text evidence checking feasible. They are not reliable rendered PDF coordinates; visual highlighting requires separate PDF.js text-layer span mapping and occurrence disambiguation.

## Large document policy

Chunking uses overlapping character windows with offsets and Postgres full-text indexes. It is **not** yet structure-aware and the retrieval/coverage/abstention endpoint is not yet built. Next step: split at clauses and headings, use lexical search + section expansion. Absence assertions require broader search or a cautious refusal, not a top-K guess.

## Known risks

- Live Supabase integration and deployment are not yet verified until credentials are configured.
- Synchronous processing may time out, especially on scanned/large PDFs.
- DOCX text preview has no Word-equivalent pagination or formatting.
- Certain PDFs may require better spacing/layout reconstruction and OCR.
- Quote existence check alone cannot guarantee semantic entailment.
- Current demo lacks authentication; do not upload confidential files.

## Stop/go gates

Every milestone needs explicit failing/passing tests and manual regression of earlier features. README and demo must distinguish working, partial and missing capabilities.
