# Admin Dashboard — Plan (build later, after MVP validation)

**Status: PLANNED** — not in the current build. The MVP ships the public
landing + studio + auth first; this document locks the direction so the admin
build is a scoped task, not a redesign.

## Purpose

A single operator view of the running system — the "production office" behind
the Cutting Room. It is read-mostly: operators watch, investigate, and act on
individual rows; creators keep using the studio untouched.

## Scope (v1)

| Area | What it shows | Actions |
|---|---|---|
| **Overview** | Live counts: projects, users, jobs by state; provider health; today's generation volume | — (dashboards only) |
| **Users** | All accounts (Clerk id, email, created, project count, last activity) | Suspend / restore |
| **Projects** | Every project with owner, stage, status, version count, updated-at | Open in studio (deep link), delete |
| **Jobs / queue** | Workflow runs: stage, status (running/awaiting review/failed), version, error | Retry failed, cancel running |
| **Providers** | Model + provider config, success/failure rates, recent latency | Toggle provider, view last error |
| **Credits (later)** | Usage per user, credit balance | Grant / revoke credits |

## Auth & authorization

- Clerk is already the identity layer (ADR-022/023). Admin is a **role gate on
  top of the existing JWT**: an `admin` claim/role assigned per user in Clerk.
- Enforcement lives in the API — a `requireAdmin` hook next to `requireUser`
  (same 404-not-403 isolation philosophy for non-admin users).
- Routes: `/admin` + `/admin/*` are protected like `/studio`, plus the role
  check server-side. The web nav shows the Admin link only to admins.

## API surface

`/api/v1/admin/...` — all scoped behind `requireAdmin`:

- `GET /admin/overview` — aggregates for the top cards
- `GET /admin/users` · `POST /admin/users/:id/suspend`
- `GET /admin/projects` · `DELETE /admin/projects/:id`
- `GET /admin/jobs` · `POST /admin/jobs/:id/retry`
- `GET /admin/providers` · `PUT /admin/providers/:key` (enabled, model)

## Data

No new tables for v1 — everything is already in the existing schema
(projects, users via Clerk id + `owner_id`, stage/status columns, scene
versions). Only if credit-billing lands would a `credits` table be added.

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
5. Credits/billing — separate ADR, only after usage data exists

## Queue

Tracked in `docs/TASK_QUEUE.md` — this is the next milestone AFTER the MVP is
live on Vercel and exercised by a real user.
