# Phase 11 — Release audit

**Date:** 2026-10-09  
**HEAD at start:** `7c02bbc` (Phase 10 committed)  
**Branch:** `main` (clean at start)  
**Node:** v24.19.0 · **npm:** 11.17.0  
**Scope:** Defect-driven hardening only. No deploy. No Phase 12/13.

## Environment

- Local Windows; Supabase + Groq configured via `.env.local` (not committed).
- Baseline: `typecheck` pass · **213→219** tests · `build` pass.
- Production preview: `next start` on **:3002** (ungated) and **:3003** (gated).
- Dev server on :3000 left alone when present.

## Requirements coverage (summary)

| ID | Status | Evidence | Release-blocking? |
| --- | --- | --- | --- |
| A1–A5 | VERIFIED | validate/extract/process tests + fixtures | No |
| A6–A7 | VERIFIED | chat tests + prior live Groq | No |
| A8–A9 | VERIFIED | persist tests; live Stop timing still unproven | Soft P2 |
| A10–A15 | VERIFIED | evidence/retrieval/chat tests; 150-page sparse fixture | Dense commercial PDF timing unverified |
| B1 / B1b | VERIFIED | pdf/docx citation tests + prior browser | Exotic PDF order may fail align (P2) |
| B2 | VERIFIED | multi-doc tests + prior live/browser | No |
| B3 | VERIFIED | compare + significance + prior live | Heuristic ≠ legal advice |
| C2 | VERIFIED | agent tests + prior live multi-round Groq | Activity not durable |
| SUB* | PARTIAL | README updated; screenshots/video/deploy pending | Phase 12–13 |

## P0 — Public API access (resolved in code; requires deploy config)

**Finding:** All `/api/*` routes used the service-role client with **no authentication**. `GET /api/documents` listed every document ID; file/text/delete/chat/agent/compare were reachable by anonymous callers. Private Storage did **not** protect these routes.

**Severity:** P0 for any public URL.

**Fix:** Optional shared deployment gate:

- Env: `PACTRIEVE_ACCESS_TOKEN`
- When unset: local single-user behaviour unchanged (intentional).
- When set: middleware returns **401** for `/api/*` unless `Authorization: Bearer …` or httpOnly cookie from `POST /api/access`.
- Library shows unlock UI (`AccessGate`).

**Verified:** Port 3003 — no auth → 401; Bearer → 200; cookie unlock after Secure-flag fix → 200.

**Deploy rule:** Any publicly reachable host **must** set `PACTRIEVE_ACCESS_TOKEN` and use only synthetic contracts. Omitting the token on a public URL reopens the P0.

## Other findings

| ID | Sev | Issue | Fix / status |
| --- | --- | --- | --- |
| P11-2 | P1 | Access cookie used `Secure` whenever `NODE_ENV=production`, so cookie unlock failed on `http://localhost` production preview | Fixed: Secure only when request is HTTPS / `x-forwarded-proto: https` |
| P11-3 | P1 | Several routes echoed raw `Error.message` (possible DB/provider leakage) | Hardened agent/research/chat conversation + compare 5xx paths to generic messages |
| P11-4 | P1 | Agent `maxDuration=60` tight vs 55s agent budget + overhead | Raised agent route to **90**; process route to **120** (Vercel Hobby ≤300s) |
| P11-5 | P2 | DELETE document response lacked `Cache-Control: no-store` | Added |
| P11-6 | P2 | Next.js 16 deprecates `middleware` file convention in favour of `proxy` | Build still works; migrate in Phase 12 if required |
| P11-7 | P2 | Live Groq Stop abort timing never separately proven | Accepted limitation |
| P11-8 | P2 | Sparse 150-page fixture extract ~668ms locally — **not** proof for dense commercial PDFs | Documented; process maxDuration raised |

## Large document (sparse fixture)

`fixtures/phase2-contract-150.pdf` via `scripts/phase11-measure-150.mjs`:

- pages: 150 · extractMs ≈ **668** · chunkMs ≈ 1 · chunks 11 · retrieveMs ≈ 2 · verifyOk true

## Production-mode smoke (:3002)

- `/`, `/agent`, `/research`, `/compare` → 200
- `/api/documents` → list
- `/api/documents/:id/text` → 200
- `/api/documents/:id/file?raw=1` → 200, `Cache-Control: private, no-store`
- `/pdf.worker.min.mjs` → 200
- Browser: library (5 docs), select α/β, Agent Research workspace + DOCX preview loaded

## Security conclusions

- Service-role and LLM keys remain server-only (`NEXT_PUBLIC_*` limited to anon upload path).
- Sensitive file routes already used `private, no-store` / `no-store`.
- Without `PACTRIEVE_ACCESS_TOKEN` on a public host, documents remain world-readable via API — **operational P0**.
- Access gate is a shared passphrase, **not** multi-tenant auth.

## Hosting duration

- Configured route caps: process 120s · agent 90s · research chat 90s · compare 60s — within current Vercel Hobby max (300s).
- Dense PDF processing still may need durable workers later; not introduced in Phase 11.

## Phase 12 recommendations

1. Set `PACTRIEVE_ACCESS_TOKEN` on the live project before publishing the URL.
2. Seed only synthetic fixtures; wipe or isolate evaluator data as needed.
3. Re-run evaluator journey on the deployed URL (upload → chat → cite → multi-doc → compare → agent).
4. Consider migrating `middleware.ts` → Next 16 `proxy` convention if required.
5. Capture screenshots/demo for Phase 13.

## Quality gates (end of Phase 11)

- `npm run typecheck` — pass
- `npm test` — **219/219** pass
- `npm run build` — pass (includes `/api/access`, middleware/proxy warning noted)
