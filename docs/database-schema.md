# Database Schema

> Status: **Current — Phase 1+2 build** · Last updated: 2026-08-06 · Postgres · ORM: **Drizzle (ADR-013)**.
> Table/column names below are the contract; the Drizzle schema lives in `packages/db`
> (`phase-1-2-production-plan.md`, Task 4).
>
> **Vertical slice (ADR-014):** the slice ran on SQLite (zero containers) with the same shapes as
> `text`/json columns — `projects` + `scripts` only. This doc is the Phase 1+2 Postgres target the
> slice's columns map onto mechanically.

## Principles

- **Postgres is the source of truth** for project structure, state, and versions.
- Generated **bytes live in R2** (Phase 3+); the DB stores keys/URLs and metadata only.
- **Everything reviewable is versioned.** Scripts, storyboards, and scenes keep version rows so
  users can compare and roll back (vision: versioning is "secret sauce").
- Stage state lives in the **LangGraph checkpoint**, not a DB table: the API derives stage/status
  from `getState(thread).values.stage` (+ `tasks[].interrupts` for gate state) — never from a
  materialized table. `projects.stage` is a **lazily-patched convenience column** (written only
  during discovery); it is deliberately stale and must not be read for UI state (api-design.md
  "exact contract"; the slice hit this in Task 8).
- Conversation, brief, and research content live **on the `projects` row** (jsonb) in Phase 1+2;
  they graduate to dedicated tables only if long-form scale demands pagination or reuse.

## ER overview

```
Clerk (external) 1─* Projects 1─* Scripts      (version rows on scripts itself)
                            ├─ 1─* Storyboards 1─* Scenes   (version rows on scenes itself)
                            └─ conversation · brief · brief_history · research_packet
                               (jsonb columns on the projects row)
```

## Tables

### users
- **Deferred / no local table (ADR-023)** — Clerk is a managed provider and owns identity. There
  are **no local `users`/`account`/`session` tables** in this build; `projects.owner_id` stores
  Clerk's user id (`user_...`, text). If self-hosted auth ever replaces Clerk, Better Auth's
  Drizzle adapter (ADR-012) adds these tables — a migration, not surgery.

### projects
- `id` uuid PK (default random)
- **`owner_id` text NOT NULL — Clerk user id (`user_...`), indexed (ADR-023)** — every query is
  scoped by it; cross-user access returns `404` (api-design.md, ADR-022).
- `idea` text NOT NULL — the user's one-line idea
- `title` text
- `stage` text NOT NULL DEFAULT `'discovery'` — mirrors the workflow's stage channel
  (`discovery | brief | research | script | script_review | storyboard | done`); later phases extend
  it (generation | review | render | export). **Read it from the checkpoint** — the column is a lazy patch.
- `status` text NOT NULL DEFAULT `'active'` — richer lifecycle values (draft | briefing | … | failed)
  arrive with later phases
- `conversation` jsonb NOT NULL DEFAULT `'[]'` — discovery interview messages
  (`{ role: user|assistant, content, at }[]`), written by the planning agent
- `brief` jsonb — creative brief (topic, audience, platform, style, durationSeconds, tone,
  narration, aspectRatio)
- `brief_history` jsonb NOT NULL DEFAULT `'[]'` — append-only brief revisions (newest last)
- `research_packet` jsonb — research agent output (timeline, concepts, terminology, references,
  key_events)
- `research_status` text NOT NULL DEFAULT `'pending'` — `pending | draft | approved | rejected`
- `characters` jsonb NOT NULL DEFAULT `'[]'` · `locations` jsonb NOT NULL DEFAULT `'[]'` —
  consistency agent outputs
- `storyboard_version` integer NOT NULL DEFAULT `0`
- `production_plan_status` text NOT NULL DEFAULT `'draft'` — `draft | ready`
- `created_at`, `updated_at` timestamptz NOT NULL DEFAULT now()

### scripts
- `id` uuid PK (default random) · `project_id` uuid NOT NULL FK → projects
- **Version rows live on this table** (no separate `script_versions` table — see "Superseded
  table shapes"):
  `version` integer NOT NULL · `content` jsonb NOT NULL (title, hook, introduction, body[],
  conclusion, cta) · `review_scores` jsonb (clarity, pacing, engagement, retention, redundancy,
  notes, overall) · `review_notes` text · `created_by` text NOT NULL DEFAULT `'ai'` (`ai | user`)
- `created_at` timestamptz NOT NULL DEFAULT now() · **Unique: `(project_id, version)`**
- The latest version is the active script; regenerate/reject round-trips and user edits each add a
  row (rollback = restore an older version → new row).

### storyboards
- `id` uuid PK (default random) · `project_id` uuid NOT NULL FK → projects · `version` integer NOT
  NULL · `status` text NOT NULL DEFAULT `'draft'` · `created_at` timestamptz NOT NULL DEFAULT now()
- **Unique: `(project_id, version)`** — latest version is the active storyboard.

### scenes
- `id` uuid PK (default random) · `storyboard_id` uuid NOT NULL FK → storyboards · `"order"` integer
  NOT NULL · `version` integer NOT NULL · `title` text NOT NULL
- `content` jsonb NOT NULL — (narration, visual_description, camera_direction, duration_seconds,
  transition, music_cue)
- `prompt_pack` jsonb — (image_prompt, video_prompt, narration_prompt, music_prompt, sfx_prompt),
  per scene, from the Prompt Agent
- `status` text NOT NULL DEFAULT `'pending'` — generation statuses (queued | generating | review)
  arrive with Phase 3
- `created_at`, `updated_at` timestamptz NOT NULL DEFAULT now()
- **Unique: `(storyboard_id, "order", version)`** — reorders bump `order`, edits/prompt
  regenerations bump `version` (latest per `(storyboard_id, order)` is the current scene).

## Later phases (not built yet)

Reserved shapes from the original full-build draft; they arrive with the phases that need them
(development-roadmap.md):
- `jobs` + `exports` + `settings` (Phases 3–4) — queue metadata, export artifacts, per-project
  defaults (duration_seconds, aspect_ratio, quality_threshold, watermark, voice_id, music_style,
  model_preferences).
- `scene_assets` (Phase 3) — R2 keys/URLs per scene (image | video | voice | sfx | music | captions).

## Superseded table shapes (built as columns / version rows instead)

The original full-build draft modeled these as separate tables; the Phase 1+2 plans (and the built
slice) deliberately fold them onto the rows above — **no such tables exist**:
- `conversations` + `messages` → **`projects.conversation` jsonb** (discovery interview messages).
- `research_packets` → **`projects.research_packet` jsonb** (research agent output).
- `script_versions` → **version rows on `scripts`** (unique `(project_id, version)`; latest row is
  the active script, rollback = restore an older content as a new row).
They graduate to dedicated tables only if long-form scale demands pagination or cross-project reuse
(decisions.md item 3, ADR-014/024).

## Versioning & history

- Scripts, storyboards, and scenes keep **version rows on their own tables** (unique keys above).
- The brief keeps `projects.brief_history` jsonb[] (append-only, newest last).
- Rollback = restore an older version → new version row (API: `PUT .../versions`).

## Enums (single source)

Workflow/API statuses are defined once in `packages/shared` (zod + TS unions) and mirrored in the
DB as `text` columns with defaults (see tables): `ProjectStage`, `StageStatus`, `ScriptStatus`,
`CreatedBy`. The frontend and API import from `packages/shared` — no stringly-typed statuses.

## Indexing & notes

- All FK columns indexed. `projects(owner_id, updated_at DESC)` powers the authenticated dashboard
  list (`WHERE owner_id = $user`) from day one (ADR-022).
- `scripts(project_id, version DESC)`, `storyboards(project_id, version DESC)`,
  `scenes(storyboard_id, "order", version DESC)` serve latest-version lookups.
- Timestamps: `timestamptz`, UTC everywhere.
- Migrations: one migration per change, committed with the code (ADR in decisions.md).

## Decisions & open questions

1. ~~ORM~~ → **Decided: Drizzle (ADR-013).** Migrations via `drizzle-kit` (dev `push`; prod
   `generate` + `migrate`).
2. ~~Auth tables~~ → **Decided: Clerk (ADR-012/023)** — managed provider; no local auth tables.
   Clerk owns identity; `owner_id` stores Clerk user ids (`text`). Email/password initially, OAuth later.
3. Conversation storage: **jsonb on `projects`** (chosen for Phase 1+2); a `messages` table returns
   only if pagination/scale demands it.
4. Decided: product name is **Slate** (ADR-025).
