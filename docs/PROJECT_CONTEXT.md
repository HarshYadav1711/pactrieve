# Pactrieve: project context

**Tagline:** Every answer, traceable.

**Assignment:** Six-page SDE legal-contract web app (see `ASSIGNMENT_SOURCE.md` / SDE Assignment.pdf). Deadline: 3 days from receipt. Most important requirement: independently verified quotes with exact source navigation. Parts A and B required; Part C Option 2 selected (agentic document research).

**Governance:** `AGENTS.md` reading order. Phase gates: `docs/phases.md`. Design: `docs/Design.md`.

## Phase status (2026-10-10)

- **Phase 0–11:** Complete (committed through `c03d802` — API hardening + access gate).
- **Phase 12:** Deployment **PREPARED** in working tree (**uncommitted fail-closed fix**). No Vercel deploy yet. See `docs/PHASE12_DEPLOYMENT.md`.
- **Phase 13:** Not started. Blocked until live URL acceptance.

## Current implementation

- Evidence-first chat, multi-doc research, compare + significance, agent research.
- Access gate: token required when set; **Vercel without token fails closed (503)**.
- PDF worker via `postinstall` → `public/pdf.worker.min.mjs`.

## Next immediate steps

1. User reviews/commits Phase 12 fail-closed changes.
2. User pushes and authorizes Vercel project + secrets + deploy.
3. Post-deploy smoke (anonymous deny → unlock → full evaluator journey).
4. Phase 13 submission artifacts.

## Ground rules

No API secrets in repo, no fictional test results, no trusting model-provided source locations, no automatic phase advance or agent commits/deploys.
