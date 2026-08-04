# Database Schema

> Status: **Draft** · Last updated: 2026-08-03 · Postgres · ORM: **Drizzle (ADR-013)**. Table/column
> names below are the contract; Drizzle schema lives in `packages/db`.
>
> **Vertical slice (ADR-014):** the slice runs on **SQLite** (zero containers) with a deliberately
> collapsed 2-table model — `projects` + `scripts` — per `specs/phase-1a-vertical-slice-design.md`
> §6. The shapes below are the full-build target; the slice uses the same data shapes as jsonb/text
> columns so the later migration into these tables is mechanical.

## Principles

- **Postgres is the source of truth** for project structure, state, versions, and job metadata.
- Generated **bytes live in R2**; the DB stores keys/URLs and metadata only.
- **Everything reviewable is versioned.** Scripts, storyboards, and prompt revisions get version rows
  so users can compare and roll back (vision: versioning is "secret sauce").
- Stage state is derived, not duplicated: the workflow engine writes stage status; the DB is
  queried by the UI via materialized `ProjectStages` rows for fast status rendering.

## ER overview

```
Users 1─* Projects 1─* Conversations 1─* Messages
                │
                ├─ 1─* ResearchPackets
                ├─ 1─* Scripts 1─* ScriptVersions
                ├─ 1─* Storyboards 1─* Scenes
                ├─ 1─* Jobs
                ├─ 1─* Exports
                └─ 1─1  Settings
Scenes 1─* SceneAssets   (R2 keys, kind: image|video|voice|sfx|music|captions)
```

## Tables

### users
- **Deferred / no local table (ADR-023)** — Clerk is a managed provider and owns identity. There are
  **no local `users`/`account`/`session` tables** in this build; `projects.owner_id` stores Clerk's
  user id (`user_...`, text).

### projects
- `id` uuid PK · **`owner_id` text NOT NULL — Clerk user id (`user_...`), indexed (ADR-023)** · `title` text ·
  `status` enum (draft | briefing | researching | scripting | review | storyboarding | generating |
  rendering | exporting | done | failed)
- `stage` enum (idea | brief | research | script | storyboard | scenes | generation | review |
  render | export) — the current workflow stage
- `brief` jsonb (creative brief object, versioned via history below) · `settings_id` uuid FK
- `created_at`, `updated_at`

### conversations
- `id` uuid PK · `project_id` uuid FK →projects · `messages` jsonb[] **or** separate `messages`
  table — decision: use a `messages` table for durability and pagination.
- `created_at`, `updated_at`

### messages
- `id` uuid PK · `conversation_id` uuid FK · `role` enum (user | assistant | system) ·
  `content` text · `metadata` jsonb · `created_at`
- Index: `(conversation_id, created_at)`

### research_packets
- `id` uuid PK · `project_id` uuid FK · `version` int · `content` jsonb (timeline, concepts,
  terminology, references, key_events) · `source` enum (web | synthesized) · `status` enum
  (draft | approved | rejected) · `created_at`
- Index: `(project_id, version)`

### scripts
- `id` uuid PK · `project_id` uuid FK · `status` enum (draft | in_review | approved | rejected) ·
  `title` text · `created_at`, `updated_at`
- Active content lives in the latest `script_versions` row.

### script_versions
- `id` uuid PK · `script_id` uuid FK · `version` int · `content` jsonb (title, hook, introduction,
  body, conclusion, cta) · `review_scores` jsonb · `review_notes` text · `created_by` enum
  (ai | user) · `created_at`
- Unique: `(script_id, version)` · Index: `(script_id, version DESC)`

### storyboards
- `id` uuid PK · `project_id` uuid FK · `version` int · `status` enum · `created_at`
- Children: `scenes`.

### scenes
- `id` uuid PK · `storyboard_id` uuid FK · `order` int · `title` text · `content` jsonb
  (narration, visual_description, camera_direction, duration_seconds, transition, music_cue) ·
  `prompt_pack` jsonb (image_prompt, video_prompt, narration_prompt, music_prompt, sfx_prompt) ·
  `status` enum (pending | queued | generating | review | approved | rejected) ·
  `quality_scores` jsonb · `created_at`, `updated_at`
- Unique: `(storyboard_id, order)`

### scene_assets
- `id` uuid PK · `scene_id` uuid FK · `kind` enum (image | video | voice | sfx | music | captions) ·
  `r2_key` text · `url` text · `duration_ms` int · `status` enum · `created_at`

### jobs
- `id` uuid PK · `project_id` uuid FK · `type` enum (research | script | storyboard | image | video |
  voice | render | export) · `status` enum (queued | running | succeeded | failed | cancelled) ·
  `attempts` int · `payload` jsonb · `result` jsonb · `error` text · `created_at`, `started_at`,
  `finished_at`
- Index: `(status)`, `(project_id, created_at DESC)`

### exports
- `id` uuid PK · `project_id` uuid FK · `format` enum (mp4) · `r2_key` text · `url` text ·
  `thumbnail_key` text · `captions_key` text · `package_key` text · `status` enum ·
  `size_bytes` bigint · `created_at`

### settings
- `id` uuid PK · `project_id` uuid FK · `duration_seconds` int · `aspect_ratio` text ·
  `quality_threshold` numeric · `watermark` boolean · `voice_id` text · `music_style` text ·
  `model_preferences` jsonb · `created_at`, `updated_at`

## Versioning & history

- `scripts`/`script_versions`, `storyboards` + `scenes.version`, `research_packets.version` cover
  the versionable artifacts.
- The **brief** lives as a jsonb column on `projects`; brief revisions are recorded as
  `projects.brief_history` jsonb[] (append-only, newest last) to avoid a fifth table in Phase 1.

## Enums (single source)

Enums are defined once in `packages/shared` (zod + TS union) and mirrored in Postgres via
migration. The frontend and API import from `packages/shared` — no stringly-typed statuses.

## Indexing & notes

- All FK columns indexed. `projects(owner_id, updated_at DESC)` powers the authenticated dashboard
  list (`WHERE owner_id = $user`) from day one (ADR-022).
- `jobs(status)` for the worker queue visibility; `jobs(project_id)` for history.
- Timestamps: `timestamptz`, UTC everywhere.
- Migrations: one migration per change, committed with the code (ADR in decisions.md).

## Decisions & open questions

1. ~~ORM~~ → **Decided: Drizzle (ADR-013).** Migrations via `drizzle-kit` (dev `push`; prod
   `generate` + `migrate`).
2. ~~Auth tables~~ → **Decided: Clerk (ADR-012/023)** — managed provider; no local auth tables. Clerk
   owns identity; `owner_id` stores Clerk user ids (`text`). Email/password initially, OAuth later.
3. `messages` as a table (recommended) vs jsonb array — table chosen for durability/pagination.
4. Decided: product name is **Slate** (ADR-025).
