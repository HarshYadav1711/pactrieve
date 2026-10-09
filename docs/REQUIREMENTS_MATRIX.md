# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-09 — Phase 10 working tree, **not yet user-committed**):

Phase 4–9 remain VERIFIED (committed through `025fd88`). Live Groq Stop timing **not** proven.

Phase 10 gates:

- `npm run typecheck` — pass
- `npm test` — **213/213** pass (adds `agent.test.mts`)
- `npm run build` — pass (`/agent`, `/api/agent/research`, `/api/agent/conversations`)
- Live Groq: multi-round tool loop (search → inspect_passage on issued ref → further search); verified citations; amounts/notice preserved
- Browser: Agent Research desk; reopen saved conversation; Alpha + Beta citation highlights

| ID | Feature | Status | Relevant files | Tests | Known limitations | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | PDF/DOCX upload; reject other types | VERIFIED | validate, initiate, page | Phase 1 | — | 1 |
| A2 | Text extraction and persistence | VERIFIED | extract, process | Phase 1 | — | 1 |
| A3 | Processing status UX | VERIFIED | page, process | Phase 1 | — | 1 |
| A4 | Scanned / no-text PDF handling | VERIFIED | extract, process | Phase 1 | OCR not supported | 1 |
| A5 | Document library | VERIFIED | page, APIs | Phase 1 | — | 1 |
| A6 | Document chat Q&A | VERIFIED | chat pipeline, DocumentChat, chat route | chat + live Groq | — | 3 |
| A7 | Streaming responses | VERIFIED | openai-compatible, SSE, DocumentChat | chat + live | — | 3 |
| A8 | Stop generation; keep partial | VERIFIED | persist/*, stop route, DocumentChat | persist.test.mts + live A/B | Crash may lose tokens after last checkpoint; live Groq Stop timing not proven | 4 |
| A9 | Per-document chat history | VERIFIED | conversations API, DocumentChat | persist tests + live B | Bounded message limit | 4 |
| A10 | Verified quotes | VERIFIED | verify.ts + chat citations | evidence + chat | Literal match ≠ entailment | 0–3 |
| A11 | Whitespace-tolerant matching | VERIFIED | normalizeWithSourceMap | evidence | — | 0 |
| A12 | Reject unverified quotes in answers | VERIFIED | citations.ts, pipeline | chat tests | — | 3 |
| A13 | Abstain when not in document | VERIFIED | prompts + coverage + pipeline | chat tests | — | 2–3 |
| A14 | Large documents (~150 pages) strategy | VERIFIED | chunks + retrieval + chat budget | retrieval + chat | Lexical only | 2–3 |
| A15 | Partial read ≠ full coverage / no false absence | VERIFIED | retrieval + chat abstention | retrieval + chat | — | 2–3 |
| B1 | PDF citation navigation / highlight | VERIFIED | PdfCitationViewer, src/lib/pdf/* | pdf-citation.test.mts + browser | Pathological PDF text order may fail align | 5 |
| B1b | DOCX citation navigation / highlight | VERIFIED | DocxCitationViewer, src/lib/docx/* | docx-citation.test.mts + browser | Not Word page-fidelity; headers/footers limited | 6 |
| B2 | Multi-document questions / comparative synthesis | VERIFIED | multi-pipeline, research APIs, MultiDocumentChat, /research | multi-doc.test.mts + live Groq + browser | Selection 2–5; lexical miss ≠ absence | 7 |
| B3 | Document version comparison | VERIFIED | compare/*, significance/*, /api/compare, /compare, VersionCompareLedger | compare + significance + live + browser | Heuristic significance ≠ legal certainty; enrichment optional | 8–9 |
| C2 | Agentic document research | VERIFIED | agent/*, /api/agent/*, /agent, AgentResearchChat | agent.test.mts + live Groq + browser | Activity timeline not durable; live Stop timing vs Groq tool rounds unproven; incomplete research disclosed via limitReason | 10 |
| SUB* | Submission deliverables | PARTIAL / NOT_STARTED | README | — | Screenshots/video/deploy pending | 12–13 |

## Phase 10 notes

- Genuine multi-round tool selection observed live (inspect followed search-issued `p1`).
- Fake-provider tests prove orchestration consumes model tool calls; live Groq proves provider compatibility separately.
- Ask Documents (`/research`) remains non-agentic RAG; Agent Research (`/agent`) is the Part C path.
- Fixtures: `fixtures/phase7-alpha.docx`, `fixtures/phase7-beta.docx`.
