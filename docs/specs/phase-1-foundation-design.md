# Phase 1+2 — Foundation & Storyboarding: Design Spec

> Status: **Approved** (2026-08-03, user) · Last updated: 2026-08-03 · Covers original Phases 1
> and 2 as **one spec** · Companion docs: architecture.md, ai-pipeline.md, database-schema.md,
> api-design.md, ui-design.md, quality-gates.md.
>
> **Scope change:** per user decision (2026-08-03), the first spec widens from "idea → approved
> script" to "idea → **approved, editable production plan**" — script, storyboard, ordered scenes,
> and per-scene prompt packs. **The vertical slice is skipped (ADR-018)** — this spec is the first
> build. **Auth is in scope (ADR-022/023): multi-user isolation from day one** — managed via
> **Clerk** (ADR-023); `projects.owner_id` stores Clerk's user id (required), session-guarded routes.

## 1. Goal

A user goes from a one-line idea to an **approved, editable production plan**: an approved,
quality-scored script decomposed into an ordered storyboard of scenes (each with narration, visual
description, camera direction, duration, transition, music cue), each scene carrying optimized
prompt packs (image, video, narration, music, SFX) — everything reviewable, editable, and versioned,
**ready for Phase 3 media generation**.

## 2. Scope

### In

- **Auth (ADR-022/023): multi-user from day one** — **Clerk** (managed provider, ADR-023) with
  email/password + OAuth out of the box; **no local auth tables** (Clerk owns identity);
  `projects.owner_id` stores Clerk's user id (`user_...`, required, indexed); every route requires a
  session and scopes by `owner_id`; cross-user access → `404`
- Creative Discovery (idea → clarifying questions → brief) · Research packet · Script + review
- **Storyboard** generation (script → scenes) with Scene Editor and scene ordering (drag-to-reorder)
- **Prompt generation** per scene (image/video/narration/music/SFX), surfaced behind an
  **"Advanced" toggle** in the UI
- Review gates: research, script, storyboard (approve / reject → regenerate with feedback)
- Versioning: scripts, storyboards, scenes (version rows, like scripts), prompt packs
- LangGraph workflow (thread_id = project id), Postgres checkpointer, provider abstraction,
  SSE progress
- "The Cutting Room" UI: sign-in/sign-up pages, session-guarded workspace; stepper extends through
  Storyboard → Scenes → Prompts

### Out (deferred)

- Multi-language, collaboration, series, API (OAuth/social is already included via Clerk — enable
  providers in the Clerk dashboard when wanted)
- BullMQ + Redis (agents run inline in the API for Phases 1–2; queue arrives with media jobs in
  Phase 3)
- Media generation, R2, voice, captions, FFmpeg, render, export (Phases 3–4)
- Cross-scene continuity QA and auto scene repair (Phase 5)
- Multi-language, collaboration, series, API (Phase 6)

## 3. User stories

1. I sign up / sign in; everything I create is mine — the dashboard shows only my projects, and
   another account can never see or open them (cross-user access returns `404`).
2. I type an idea; the studio asks only what it needs, then proposes an editable brief I approve.
3. I review/regenerate the research packet before it grounds the script.
4. I get a structured script (title, hook, intro, body, conclusion, CTA) with quality scores; weak
   scripts trigger specific revision suggestions.
5. I edit the script (TipTap), save versions, compare, roll back, and approve.
6. I approve the script and the studio produces a **storyboard**: ordered scenes, each with
   narration, visual description, camera direction, duration, transition, music cue.
7. I can **reorder scenes**, edit any scene's fields, and regenerate a single scene without
   touching the rest.
8. I can generate, edit, and regenerate **prompt packs** per scene.
9. I approve the storyboard and see the final **production plan** — the full editable blueprint for
   generation.
10. Stage failures are visible and retryable; nothing is lost.

## 4. Architecture

```
web (Next.js) ── REST + SSE ──► api (Fastify)
                                  ├─► Postgres (data + LangGraph checkpointer)
                                  └─► LangGraph workflow (thread_id = project id)
                                         discovery (interview) → brief
                                         → research_gate [interrupt]
                                         → research → script → script_review → script_gate [interrupt]
                                         → storyboard → prompt_gen → storyboard_gate [interrupt]
                                         → done
```

- **Clerk in front (ADR-023):** the API has **no auth routes of its own** — a `requireUser` hook
  verifies the Clerk session JWT (`clerkClient.verifyToken`, `Authorization: Bearer`) and attaches
  `req.userId`; every `/api/v1` route is session-required and scopes by `owner_id` — the dashboard
  lists `WHERE owner_id = $user`, and cross-user access returns `404` (never `403`, to avoid
  leaking existence).

- **Agents (new for this spec):** Storyboard Agent (script → scenes), Cinematography Agent
  (camera/framing/movement/lighting/composition per scene), Prompt Agent (per-scene prompt packs),
  Character Agent + Environment Agent (consistency records on the project, seeded from brief+script),
  and **Editor Agent** (per-scene transition and music cue fields only, written into each scene's
  content) — the full crew minus Voice Director (cut 2026-08-03; spec §12.7).
- **Consistency:** Character/Environment agents maintain `projects.characters` and
  `projects.locations` (jsonb) read by the Storyboard + Prompt agents so scenes stay coherent.
- **Storyboard gate:** approves the scene list + ordering; rejection routes back to the Storyboard
  agent with feedback. Prompt packs regenerate per-scene without re-running the storyboard.
- **No queue:** agents run inline in the API for this spec (seconds-scale text calls); Phase 3
  moves media generation into BullMQ.

## 5. Data model (additions to Phase 1 subset)

Full schema in database-schema.md. This spec creates:

- **No local `users`/`account`/`session` tables (ADR-023).** Clerk owns identity in its cloud.
  `projects.owner_id` stores Clerk's user id as **`text NOT NULL`, indexed** (value: `user_...`).
  `brief`, `research_packet` jsonb; new: `characters` jsonb[], `locations` jsonb[],
  `storyboard_version` int, `production_plan_status` enum).
- `scripts` + versions (as in Phase 1 subset).
- **`storyboards`**: `id`, `project_id`, `version` int, `status` (draft | approved), `created_at`.
- **`scenes`**: `id`, `storyboard_id`, `order` int, `version` int, `title`, `content` jsonb
  (narration, visual_description, camera_direction, duration_seconds, transition, music_cue),
  `prompt_pack` jsonb (image_prompt, video_prompt, narration_prompt, music_prompt, sfx_prompt),
  `status` (pending | approved), `created_at`, `updated_at`.
  Unique: `(storyboard_id, order)` — scene edits create a new version row (like scripts).
- `jobs`, `settings` — deferred with the queue (Phase 3).

## 6. API (additions to Phase 1 subset — full detail in api-design.md)

- **No `/api/auth/*` routes (ADR-023).** Auth lives in Clerk: hosted sign-in/sign-up, session
  tokens issued by Clerk. The API verifies the Bearer JWT in a `requireUser` hook.
- All project endpoints are **session-required and owner-scoped** — cross-user access returns `404`.
- `GET /api/projects/:id/storyboard` — scenes (latest versions, ordered).
- `POST /api/projects/:id/stages/storyboard/approve` — `{ approved, feedback? }` → resume thread.
- `POST /api/projects/:id/stages/storyboard/regenerate` — re-run Storyboard agent.
- `PUT /api/projects/:id/scenes/:sceneId` — edit scene content → new version row.
- `PUT /api/projects/:id/storyboard/order` — `{ scene_ids: [...] }` → reorder (atomic, one txn).
- `POST /api/projects/:id/scenes/:sceneId/prompts/regenerate` — regenerate that scene's prompt pack.
- `PUT /api/projects/:id/scenes/:sceneId/prompts` — manual prompt pack edit.
- `GET /api/projects/:id/production-plan` — consolidated read-only view: script + scenes + prompts
  (the artifact Phase 3 consumes).

## 7. UI (per ui-design.md — "The Cutting Room")

> **Experience direction (ADR-020, in review):** the user has directed OpenArt as the primary
> design reference for experience + interface. `docs/openart-design-direction.md` (draft) evolves
> the workspace into a three-zone production console (call-sheet rail / canvas / director's notes)
> with a persistent Director Bar, take log, and asset tray — the token sheet and stage content
> below are unchanged. This section stays as the locked baseline until that direction is approved.

> **Visual source of truth:** `prototypes/cutting-room-full.html` is **approved as-is** — it shows
> every screen, stage, state, and micro-interaction in this section. Port it into the app; do not
> redesign.

- **Clerk UI** (`@clerk/nextjs`): `<ClerkProvider>`, `<SignedIn>/<SignedOut>`, `<UserButton>`;
  sign-in/sign-up are Clerk-hosted (or embedded `<SignIn />` components) — no bespoke auth forms.
  The workspace is session-guarded and shows only my projects.
- Stepper extends: `Idea → Brief → Research → Script → Storyboard → Scenes → Prompts → Ready`.
- **Storyboard view:** scene cards as slate lines (`SC 01 · 04.2s · CUT`), drag-to-reorder,
  per-scene status chip, regenerate per scene; Coverage rail shows consistency records
  (characters/locations) and transition/music suggestions.
- **Scene editor:** fields per scene (narration, visual description, camera direction, duration,
  transition, music cue) + **prompt pack tabs (image/video/narration/music/SFX) revealed behind an
  "Advanced" toggle** — the default view stays on narration/visuals; prompt editing is opt-in.
- **Production plan view:** the full editable blueprint — script, scenes in order, prompt packs —
  with an "approve plan" action that closes the spec's flow.
- Token sheet only; REC dot, timecode, stamps, retake errors as before.

## 8. Error handling

- Provider failure / 429 → backoff + fallback provider → visible retryable stage failure
  ("RETAKE — reason").
- Malformed AI output → Zod → one re-parse → typed failure.
- Scene regenerate failures are **isolated** to that scene; the rest of the plan is untouched.
- Reorder conflicts → 409 with server truth (optimistic concurrency on `order`).
- Resume with no pending interrupt → `409 CONFLICT`. No silent continuation (quality-gates.md).

## 9. Testing (per testing-strategy.md)

- **Workflow (FakeProvider):** happy path idea → production plan; reject loops at every gate
  (research/script/storyboard); resume after each interrupt; provider failure → retry; garbage
  output → typed failure; interrupt survives restart.
- **Unit:** providers, Zod parsers (scene content, prompt pack), scoring, ordering logic.
- **Integration:** storyboard CRUD, reorder atomicity, scene version rows, approve/resume.
- **Auth:** token verification (fake verifier injected) → create owned project; `401` without a
  token; **isolation — user B gets `404` on every owner-scoped route of user A** (projects list,
  project, storyboard, scene edit/reorder, prompt regenerate, stage approve).
- **E2E (Playwright, FakeProvider + Clerk test mode):** sign up → idea → questions → brief →
  research → script edit → approve → storyboard reorder/edit → approve → production plan renders;
  a second account cannot see or open the first account's project. Dev-server preview renders with
  no console/page errors.

## 10. Success criteria

1. Idea → **approved script** (reviewable, versioned, quality-scored).
2. Every approved script becomes an **editable production plan**: ordered scenes with narration,
   visuals, camera, duration, transition, music cue.
3. **Scene ordering is editable**; per-scene regeneration is targeted, not project-wide.
4. Every scene has **prompt packs**; regenerating prompts doesn't disturb other scenes.
5. Provider swap is config (proven by FakeProvider tests); failures visible and retryable.

## 11. Definition of done

1. Spec approved by user. 2. Implementation plan written and approved. 3. Typecheck + tests pass.
4. Dev-server preview renders without console/page errors (verified in the running preview).
5. User demo: from idea to an approved production plan.

## 12. Decisions (locked 2026-08-03 by user)

1. **Auth:** → **In scope — multi-user from day one (ADR-022, 2026-08-04, user).** Provider:
   **Clerk (managed, ADR-023, 2026-08-04)** — no local auth tables; `owner_id` = Clerk user id
   (`text NOT NULL`, indexed); JWT verification + owner-scoped routes; `404` on cross-user access.
   Reverses ADR-021 (auth deferred) and ADR-012 (provider: Better Auth → Clerk).
2. **Vertical slice:** → **Skipped (2026-08-03, user, ADR-018).** This spec is the **first build**;
   the monorepo scaffold and provider/agent foundation (previously slice tasks) are folded into its
   implementation plan. The slice spec/plan stay in docs as skipped design history.
3. **ORM:** → **Decided — Drizzle (ADR-013).**
4. **Deployment:** → **Decided (ADR-011): local Docker first, deployable later.**
5. **NVIDIA API key:** → **Confirmed available (user has build.nvidia.com key).**
6. **Design:** → **Approved — "The Cutting Room" tokens apply from the first UI.**
7. **Voice Director:** → **Cut (2026-08-03, user)** — removed from Phase 1+2; narration style and
   pacing live in the brief and the narration prompts instead. Reverses the 2026-08-03 restore.
8. **Editor Agent:** → **Simplified to per-scene transition + music cue fields only (2026-08-03,
   user)** — no cross-scene music placement or timing plan (`projects.edit_plan` dropped); the
   editor writes `transition` and `music_cue` into each scene's content. Reverses the full-scope
   restore.
9. **Scene versioning:** → **Version rows** for scenes (edits create a new row, like scripts), not
   in-place `updated_at`.
10. **Prompt packs:** → **Behind an "Advanced" toggle** in the scene editor — opt-in, not default.
11. **Scene ordering:** → **Drag-to-reorder**, atomic server-side (one txn, `409` on conflict).

Decided: product name is **Slate** (ADR-025).
