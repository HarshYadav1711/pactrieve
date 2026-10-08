# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-08 Phase 3 — local working tree, **not yet user-committed**):

- `npm run typecheck` — pass
- `npm test` — **70/70** pass (47 prior + 23 Phase 3 chat/SSE cases)
- `npm run build` — pass (includes `/api/documents/[id]/chat`)
- Live LLM (`scripts/phase3-live-chat.mjs`) — **BLOCKED** (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL unset)
- Fake-provider long-doc measurements (150-page fixture, ~284,819 chars): retrieval 2–8 ms; TTFT ~80–144 ms; promptChars ~5.5–7.6k (≪ full document); evidence 3–4 passages

| ID | Feature | Status | Relevant files | Tests | Known limitations | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | PDF/DOCX upload; reject other types | VERIFIED | validate, initiate, page | Phase 1 | — | 1 |
| A2 | Text extraction and persistence | VERIFIED | extract, process | Phase 1 | — | 1 |
| A3 | Processing status UX | VERIFIED | page, process | Phase 1 | — | 1 |
| A4 | Scanned / no-text PDF handling | VERIFIED | extract, process | Phase 1 | OCR not supported | 1 |
| A5 | Document library | VERIFIED | page, APIs | Phase 1 | — | 1 |
| A6 | Document chat Q&A | IMPLEMENTED_UNVERIFIED | chat pipeline, DocumentChat, chat route | chat.test.mts | Live provider BLOCKED without LLM_* | 3 |
| A7 | Streaming responses | IMPLEMENTED_UNVERIFIED | openai-compatible, SSE, DocumentChat | chat tests (fragmented SSE, multi-delta) | Live multi-delta stream BLOCKED pending credentials | 3 |
| A8 | Stop generation; keep partial | NOT_STARTED | — | — | Phase 4 | 4 |
| A9 | Per-document chat history | NOT_STARTED | — | — | Phase 4; schema tables reserved | 4 |
| A10 | Verified quotes | VERIFIED | verify.ts + chat citations | evidence + chat | Chat wires registry; literal match ≠ entailment | 0–3 |
| A11 | Whitespace-tolerant matching | VERIFIED | normalizeWithSourceMap | evidence | — | 0 |
| A12 | Reject unverified quotes in answers | VERIFIED | citations.ts, pipeline | chat tests 3–6, 19 | — | 3 |
| A13 | Abstain when not in document | VERIFIED | prompts + coverage + pipeline | chat tests 7–9 | Lexical miss ≠ legal absence — copy says so | 2–3 |
| A14 | Large documents (~150 pages) strategy | VERIFIED | chunks + retrieval + chat budget | retrieval + chat 21 | Lexical only; conversational queries need content terms | 2–3 |
| A15 | Partial read ≠ full coverage / no false absence | VERIFIED | retrieval + chat abstention | retrieval + chat 8–9 | — | 2–3 |
| B1–B3 / C2 | Highlight / multi-doc / compare / agent | NOT_STARTED | — | — | Later phases | 5–10 |
| SUB* | Submission deliverables | PARTIAL / NOT_STARTED | README | — | Screenshots/video/deploy pending | 12–13 |

## Phase 3 chat notes

- Evidence IDs are request-scoped (`e1`…). Invented IDs are rejected.
- Model-proposed page/offset values are never trusted.
- Prompt-injection text in contracts is treated as evidence inside `<document_evidence>` delimiters; system instructions stay separate.
- Citation click scrolls the **extracted text** preview (not PDF text-layer overlay — Phase 5).
