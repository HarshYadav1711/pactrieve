# Phase 12 — Deployment handoff (PREPARED — not deployed)

**Date:** 2026-10-10  
**Starting HEAD:** `c03d802` (Phase 11 committed)  
**Status:** Local preflight complete. **No Vercel deploy performed.** Awaiting explicit user authorization.

## Hosting architecture

- **App:** Next.js 16.4 App Router on **Vercel** (Node.js serverless / Fluid)
- **DB + Storage:** Existing Supabase project (private bucket `pactrieve-documents`)
- **LLM:** OpenAI-compatible Groq via server-only `LLM_*`
- **Access:** Shared evaluator passphrase `PACTRIEVE_ACCESS_TOKEN` (not multi-user auth)

## Security model

| Surface | Behaviour |
| --- | --- |
| Pages (`/`, `/documents/[id]`, `/research`, `/compare`, `/agent`) | Client shells only — **no** privileged SSR document payloads |
| `/api/*` with token set | Requires Bearer or httpOnly cookie |
| Vercel / `PACTRIEVE_ENFORCE_ACCESS_GATE=1` **without** token | **Fail closed** — `/api/*` → **503** `ACCESS_GATE_MISCONFIGURED` |
| Local without token | Open (single-user development) |

Cookie: `pactrieve_access`, HttpOnly, SameSite=Lax, Secure only on HTTPS / `x-forwarded-proto: https`.

## Environment variables (names only)

| Name | Class | Required | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes | Browser signed upload |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Yes | Anon upload token only |
| `SUPABASE_URL` | Server | Yes | May match public URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Yes | Never `NEXT_PUBLIC_*` |
| `SUPABASE_STORAGE_BUCKET` | Server config | No | Default `pactrieve-documents` |
| `LLM_API_KEY` | **Secret** | Yes | Never client |
| `LLM_BASE_URL` | Server | Yes | e.g. Groq OpenAI-compatible base |
| `LLM_MODEL` | Server | Yes | Model id |
| `LLM_TIMEOUT_MS` / `LLM_MAX_TOKENS` | Server | No | Optional |
| `PACTRIEVE_ACCESS_TOKEN` | **Secret** | **Yes on Vercel** | High-entropy shared passphrase |
| `PACTRIEVE_ENFORCE_ACCESS_GATE` | Server | No | Local fail-closed simulation |

Configure the **same secrets on Production and Preview** if Preview URLs are public. Preview without the token fails closed (safe) but is not usable for evaluators.

## Framework / runtime

- Node engines: `>=22.16.0`
- `postinstall` → `scripts/copy-pdf-worker.mjs` → `public/pdf.worker.min.mjs` (gitignored; created on install)
- `serverExternalPackages`: `pdfjs-dist`, `mammoth`
- Middleware deprecation warning (Next 16 “proxy”) — warning only; do not migrate mid-deadline unless required

### Route `maxDuration`

| Route | Export |
| --- | --- |
| `/api/documents/[id]/process` | 120s |
| `/api/agent/research` | 90s |
| `/api/research/chat` | 90s |
| `/api/compare` | 60s |
| `/api/documents/[id]/chat` | 60s |

Vercel Hobby Fluid compute allows up to **300s**. Confirm plan after project creation.

## Supabase prerequisites (existing project)

Apply if not already applied (SQL editor; non-destructive):

1. `db/schema.sql`
2. `db/migrations/20261008_phase2_search_helper.sql`
3. `db/migrations/20261008_phase4_chat_persistence.sql`

Private Storage bucket; synthetic documents only on shared hosts. Do **not** reset production data.

## Local preflight (2026-10-10)

- `npm run typecheck` — pass
- `npm test` — **220/220** pass
- `npm run build` — pass
- `:3004` with `PACTRIEVE_ENFORCE_ACCESS_GATE=1` and no token → `/api/documents` **503**; `/api/access` `{misconfigured:true}`; `/` shell **200**
- `:3005` with token → anon **401**; Bearer **200**; cookie unlock **200**; PDF worker **200**; file `private, no-store`

## Exact user steps (after review)

1. Review Phase 12 fail-closed diff; **manually commit** (suggested message: `fix: fail closed when hosted without access token`).
2. **Manually push** `main` to GitHub (`origin` = `HarshYadav1711/pactrieve`).
3. In Vercel: Import/select that GitHub repo → Framework Next.js → Node 22.x.
4. Enter env vars in Vercel UI (Production **and** Preview): all rows above, especially a **high-entropy** `PACTRIEVE_ACCESS_TOKEN`.
5. Confirm private Supabase bucket + migrations.
6. Explicitly authorize deploy → Deploy.
7. Smoke: anonymous APIs 401/503; unlock; upload synthetic PDF/DOCX; chat cite; Stop; multi-doc; compare; agent.

## Rollback

- Disable Deployment or unset Preview URLs if exposure suspected.
- Remove/rotate `PACTRIEVE_ACCESS_TOKEN` and redeploy if leaked.
- Do not leave a public host running without the token (fail-closed protects APIs, but the shell remains public).

## Known limitations

- Shared token ≠ per-evaluator accounts; anyone with the passphrase shares the library.
- Sparse 150-page timing ≠ dense commercial PDF guarantee.
- Live Groq Stop abort timing still unproven.
- No automatic rate limiting beyond existing per-request budgets.

## Deployment status

**URL:** _(none — not deployed)_  
**Phase 12:** **PREPARED**  
**Phase 13 readiness:** **BLOCKED** until live URL acceptance after authorization.
