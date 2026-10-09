# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-10 — Phase 12 PREPARED, **deploy not authorized**):

Phase 0–11 committed through `c03d802`. Live Groq Stop timing **not** proven. Live Vercel URL **not** created.

Phase 12 local gates:

- `npm run typecheck` — pass
- `npm test` — **220/220** pass (hosted fail-closed tests)
- `npm run build` — pass
- Hosted missing-token → **503** (`PACTRIEVE_ENFORCE_ACCESS_GATE`); gated unlock Bearer/cookie PASS
- Pages remain client shells (no privileged SSR document data)
- Handoff: `docs/PHASE12_DEPLOYMENT.md`

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
| A14 | Large documents (~150 pages) strategy | VERIFIED | chunks + retrieval + chat budget | retrieval + chat | Sparse fixture timing ≠ dense PDF | 2–3 |
| A15 | Partial read ≠ full coverage / no false absence | VERIFIED | retrieval + chat abstention | retrieval + chat | — | 2–3 |
| B1 | PDF citation navigation / highlight | VERIFIED | PdfCitationViewer, src/lib/pdf/* | pdf-citation.test.mts + browser | Pathological PDF text order may fail align | 5 |
| B1b | DOCX citation navigation / highlight | VERIFIED | DocxCitationViewer, src/lib/docx/* | docx-citation.test.mts + browser | Not Word page-fidelity; headers/footers limited | 6 |
| B2 | Multi-document questions / comparative synthesis | VERIFIED | multi-pipeline, research APIs, MultiDocumentChat, /research | multi-doc.test.mts + live Groq + browser | Selection 2–5; lexical miss ≠ absence | 7 |
| B3 | Document version comparison | VERIFIED | compare/*, significance/*, /api/compare, /compare, VersionCompareLedger | compare + significance + live + browser | Heuristic significance ≠ legal certainty; enrichment optional | 8–9 |
| C2 | Agentic document research | VERIFIED | agent/*, /api/agent/*, /agent, AgentResearchChat | agent.test.mts + live Groq + browser | Activity timeline not durable; live Stop timing vs Groq tool rounds unproven; incomplete research disclosed via limitReason | 10 |
| SEC1 | Public deployment API protection | VERIFIED | middleware, `/api/access`, AccessGate, access tests | access.test.mts + :3004/:3005 | Local open OK; Vercel missing token fails closed (503); token required for usable public demo | 11–12 |
| DEP1 | Live Vercel deployment + evaluator smoke | BLOCKED | — | — | Awaiting user commit/push + explicit deploy authorization | 12 |
| SUB* | Submission deliverables | PARTIAL / NOT_STARTED | README | — | Screenshots/video/live URL pending | 12–13 |

## Phase 12 notes

- Deployment **PREPARED**, not executed. No public URL yet.
- See `docs/PHASE12_DEPLOYMENT.md` for env checklist and approval steps.

