# Admin Dashboard - Plan (build later, after MVP validation)

**Status: PLANNED** - not in the current build. The MVP ships the public
landing + studio + auth first; this document locks the direction so the admin
build is a scoped task, not a redesign.

## Purpose

A single operator view of the running system - the "production office" behind
the Cutting Room. It is read-mostly: operators watch, investigate, and act on
individual rows; creators keep using the studio untouched.

## Scope (v1)

| Area | What it shows | Actions |
|---|---|---|
| **Overview** | Live counts: projects, users, jobs by state; provider health; today's generation volume | - (dashboards only) |
| **Users** | All accounts (Clerk id, email, created, project count, last activity) | Suspend / restore |
| **Projects** | Every project with owner, stage, status, version count, updated-at | Open in studio (deep link), delete |
| **Jobs / work (v1)** | NO jobs table exists - see the schema audit below. The v1 "work" view derives from `projects.stage/status` + `storyboards.status` + scripts/assets counts | Retry = resume a pending gate (existing path); a real jobs table lands with the async worker queue |
| **Providers** | Model + provider config, success/failure rates, recent latency, **key presence + masked suffix** | Toggle provider, view last error |
| **Usage (v1)** | Generation volume by kind/day, failed rate, low-quality rate, per-user / per-project aggregates - **derived from existing rows** | - (dashboards only) |
| **Credits (later)** | Token/cost/latency per call (needs the `usage_events` table), usage per user, credit balance | Grant / revoke credits |

## Auth & authorization

- Clerk is already the identity layer (ADR-022/023). Admin is a **role gate on
  top of the existing JWT**: an `admin` claim/role assigned per user in Clerk.
- Enforcement lives in the API - a `requireAdmin` hook next to `requireUser`
  (same 404-not-403 isolation philosophy for non-admin users).
- Routes: `/admin` + `/admin/*` are protected like `/studio`, plus the role
  check server-side. The web nav shows the Admin link only to admins.

## API surface

`/api/v1/admin/...` - all scoped behind `requireAdmin`:

- `GET /admin/overview` - aggregates for the top cards
- `GET /admin/users` · `POST /admin/users/:id/suspend`
- `GET /admin/projects` · `DELETE /admin/projects/:id`
- `GET /admin/work` (v1 stand-in for jobs: projects by stage/status, pending gates, failed assets) · retry = the existing gate-resume path
- `GET /admin/providers` · `PUT /admin/providers/:key` (enabled, model) - **never returns raw keys**
- `GET /admin/usage` - the v1 derived usage aggregates (below)

## Data

No new tables for v1 - everything is already in the existing schema
(projects, users via Clerk id + `owner_id`, stage/status columns, scene
versions). Only if credit-billing lands would a `credits` table be added.

## Schema audit (2026-08-12) - what the current tables actually support

Verified against `packages/db/src/schema.ts` (projects, scripts, storyboards,
scenes, assets). Five findings an implementer must respect:

1. **There is NO jobs table.** Workflow runs live in LangGraph checkpoints
   (PostgresSaver's internal tables), not in the Drizzle schema - so the
   original "Jobs / queue" scope row and its endpoints had no backing data.
   v1 substitutes a **work view** derived from `projects.stage/status`,
   `research_status`, `production_plan_status`, `storyboards.status`, and
   failed `assets`. A real `workflow_runs` table is deferred to the async
   worker/queue block (BullMQ, ADR-006); "retry" is the existing gate-resume
   path until then.
2. **Users' email/created cannot come from the DB.** No local users table
   (ADR-023); `owner_id` is a Clerk id. Email + created-at per user must come
   from the **Clerk Backend API** (admin routes need a Clerk server client +
   service token). Project count derives from `projects.owner_id`; last
   activity from per-owner `MAX(projects.updated_at)`. Suspend/restore needs a
   decided mechanism (Clerk block API vs a local suspended flag) - do not
   assume it exists.
3. **`DELETE /admin/projects/:id` must delete children explicitly.** FKs are
   plain `references()` (no ON DELETE CASCADE) - delete in order
   (scripts → storyboards → scenes → assets → project) or the FK will block.
4. **Usage derivation is sound** - `assets` has `kind`, `status`, `provider`,
   `created_at`, `meta.quality`; the per-user join
   `assets → scenes → storyboards → projects.owner_id` works and SHOULD count
   all version rows (old scenes' assets are usage, not dead weight). One
   index gap: `assets` only indexes `scene_id` - add a composite
   `(status, kind, created_at)` index for the Overview time-series cards.
5. **"Last activity" is under-maintained today.** `projects.updated_at` is
   bumped only on workflow writes (`workflow.ts`); direct-DB writes (scene
   edit, pack edit/regenerate, reorder, asset generation) don't touch it.
   Either bump `updated_at` on those writes or compute activity from
   `MAX(assets.created_at, scenes.updated_at)` per project.

## Provider keys (v1) - presence, never the secret

- **Keys live in env / the platform secrets manager** (Render/Vercel env vars  - 
  see `deploy.md`), never in the DB and never in an API response. The admin UI
  shows **presence + a masked suffix** (`sk-••••1234`, last-4 only), configured
  vs missing, and the last error - nothing more.
- **Rotation = change env → redeploy** (same path as the deploy doc). No
  in-UI key editing in v1: env is the source of truth, a deliberate
  simplification. An encrypted secrets table becomes a separate ADR only if
  self-service rotation is ever needed.
- `GET /admin/providers` is the ONLY provider endpoint and it is
  read-mostly: enabled flag + model + masked key + health. Raw secrets are
  treated as un-renderable - the route would 400 before echoing them.

## Usage (v1) - derived, honest about what it does NOT measure

- v1 derives usage from **existing rows**, so it needs no schema change:
  - Generation volume by kind/day → `assets` (`created_at`, `kind`, `status`)
  - Quality signals → `assets.meta.quality` (score distribution, low-score rate)
  - Failure rate → `assets.status = 'failed'` + `error`; workflow failures via
    jobs/stage status
  - Per-user / per-project → `assets → scenes → storyboards → projects
    (owner_id)`
- **What v1 does NOT measure (explicit):** tokens, latency, and monetary cost
  per call. Those need a `usage_events` row per provider call (kind, provider,
  model, ms, tokens, bytes) - deferred to the credits/billing ADR (sequencing
  step 5), and the only schema addition on the admin horizon.
- UI: Overview cards (today's generations, by kind, failed rate, low-score
  rate); Users / Projects tables gain generation-count columns; drill-down
  uses the existing coverage-rail pattern.

## UI (Cutting Room language)

- Same token sheet: ink/tungsten/REC, mono labels, 2px radius, brackets.
- A tabbed console (Overview / Users / Projects / Jobs / Providers) with the
  existing coverage-rail pattern for detail views.
- Status chips reuse the live/ok/fail chips; failed jobs get the RETAKE
  treatment (red, actionable).

## Sequencing (when we build it)

1. `requireAdmin` hook + `admin` claim plumbing (Clerk role → JWT → hook)
2. Read endpoints + tests (TDD, same gate)
3. Admin pages in the web app
4. Suspend/retry/delete actions + E2E
5. Credits/billing - separate ADR, only after usage data exists

## Queue

Tracked in `docs/TASK_QUEUE.md` - this is the next milestone AFTER the MVP is
live on Vercel and exercised by a real user.
