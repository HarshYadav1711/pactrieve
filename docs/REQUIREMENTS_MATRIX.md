# Requirements matrix

Source: SDE Assignment.pdf (see `ASSIGNMENT_SOURCE.md`). Behavioural detail: `docs/PRD.md`. Phase gates: `docs/phases.md`.

Status legend: `NOT_STARTED` | `PARTIAL` | `IMPLEMENTED_UNVERIFIED` | `VERIFIED` | `BLOCKED`

Evidence gates for this update (2026-10-10 — Phase 13 packaging, **docs uncommitted**):

- HEAD at start: `28844d7` · Live: https://pactrieve.vercel.app  
- `npm run typecheck` / `npm test` (**220/220**) / `npm run build` — pass  
- Production anonymous: home 200 · `/api/access` required · `/api/documents` **401** · PDF worker 200  
- Authenticated live chat/compare/agent: **not retested in Phase 13** (no passphrase in agent env); prior Phase 10–12 + local screenshots  
- Demo video: **not uploaded**

| ID | Feature | Status | Tests / evidence | Known limitations | Phase |
| --- | --- | --- | --- | --- | --- |
| A1–A5 | Upload, extract, status, scan fail, library | VERIFIED | validate/extract tests + fixtures | OCR unsupported | 1 |
| A6–A7 | Grounded chat + streaming | VERIFIED | chat tests + prior live Groq | — | 3 |
| A8–A9 | Stop + history | VERIFIED | persist tests | Live Groq Stop timing unproven | 4 |
| A10–A15 | Verified quotes, abstain, large-doc | VERIFIED | evidence/retrieval/chat | Sparse≠dense PDF timing | 0–3 |
| B1 / B1b | PDF/DOCX citation nav | VERIFIED | citation tests + screenshots | Exotic PDF order may fail align | 5–6 |
| B2 | Multi-document Q&A | VERIFIED | multi-doc + screenshot 05 | Selection 2–5 | 7 |
| B3 | Version compare + significance | VERIFIED | compare/significance + screenshot 04 | Heuristic ≠ legal advice | 8–9 |
| C2 | Agentic research | VERIFIED | agent tests + Phase 10 live Groq | Re-run on prod in demo; activity not durable | 10 |
| SEC1 | Public API gate | VERIFIED | access tests + live 401 | Shared passphrase ≠ accounts | 11–12 |
| DEP1 | Live Vercel deploy | VERIFIED | URL live; anon checks | Full evaluator journey in video | 12 |
| SUB* | Screenshots / video / note | PARTIAL | screenshots + note ready | **Video URL missing** | 13 |

## Demo fixtures

- `phase7-alpha.docx` — AED 100,000 · 30 days  
- `phase7-beta.docx` — AED 1,000,000 · 60 days  
- `phase5-sample.pdf` — PDF highlight path  
