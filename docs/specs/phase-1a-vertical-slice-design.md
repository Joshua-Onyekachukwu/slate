# Phase 1a — Vertical Slice: Design Spec

> Status: **Approved for build (2026-08-03, user)** · Last updated: 2026-08-03 · **This is the first
> build** — a validation slice that proves the idea → approved-script loop before the full Phase 1+2
> spec (phase-1-foundation-design.md) hardens it with auth, queue, and the full schema.

## 1. Goal

**Prove the idea → approved-script loop end-to-end, with the minimum possible surface**, before
building full Phase 1 (auth, users, queue, full schema). If this slice delivers a polished
experience from "I want a documentary about the history of the universe" to an approved, editable,
quality-scored script — running locally on one machine — we've validated the product's core mechanic
and the architecture behind it. Then full Phase 1 (per `phase-1-foundation-design.md`) hardens it.

## 2. Scope

### In

- One project at a time from a plain-language idea; multiple projects allowed (just no auth).
- **One conversation per project** (discovery interview) stored as jsonb on the project row.
- Creative brief → script → script review, all editable, all reviewable.
- Review gate: script approval (reject → regenerate with feedback).
- Script versions (AI + user edits) stored as rows in the `scripts` table.
- LangGraph workflow with a SQLite checkpointer (`SqliteSaver`, zero containers); provider
  abstraction (NVIDIA Build primary, FakeProvider in tests); SSE progress to the UI.
- "The Cutting Room" design tokens on a thin UI (dashboard → workspace → stage views).

### Out (deferred to full Phase 1)

- Auth / users / multi-user isolation
- BullMQ + Redis (agents run inline in the API for the slice)
- R2, media generation, storyboarding, rendering, FFmpeg
- Separate `conversations`, `messages`, `research_packets`, `script_versions`, `jobs`, `settings`
  tables — the slice deliberately collapses these into 2 tables.

## 3. The deliberate trade-off

The full schema (database-schema.md) splits conversations/messages/research/script_versions into
separate tables. The slice **collapses all of it into jsonb on `projects` + version rows in
`scripts`**. This is intentional: it removes ~6 tables, migrations, joins, and pagination from the
critical path. When full Phase 1 lands, we migrate the jsonb into proper tables — the data shapes
are unchanged, so the migration is mechanical.

## 4. User stories

1. As a user, I type an idea and the studio asks me only the questions it needs, then proposes a
   brief I can edit and approve.
2. As a user, I approve the brief and the studio writes a script draft I can regenerate.
3. As a user, I get a structured script (title, hook, intro, body, conclusion, CTA) with quality
   scores; weak scripts trigger specific revision suggestions.
4. As a user, I can edit the script, save a new version, and approve it.
5. As a user, when a stage fails (rate limit, provider error), I see why and can retry — nothing is
   lost.
6. As a user, I can see live progress (SSE) instead of staring at a spinner.

## 5. Architecture (slice subset)

```
web (Next.js, thin) ── REST + SSE ──► api (Fastify)
                                        │
                                        ├─► SQLite  (projects, scripts + LangGraph checkpointer)
                                        │
                                        └─► LangGraph workflow (thread_id = project id)
                                               discovery (interview loop)
                                                   → brief → script → review → script_gate [interrupt]
                                                   → done (on approve) | back to script (on reject)
```

- **No worker, no queue:** agents run inside the API request/SSE lifecycle for the slice. The
  workflow call is started on stage kickoff and streams progress; provider calls are awaited
  (seconds-scale). Full Phase 1 moves these into BullMQ jobs.
- **Interview loop:** the Planning Agent returns `{ questions: [...] }` until it can form a brief
  (max 3 rounds), then `{ brief }`. The conversation lives on `projects.conversation` (jsonb).
- **Quality gate:** Script Reviewer scores the script (quality-gates.md dimensions, simplified to
  clarity / pacing / engagement / retention / redundancy for the slice); below threshold →
  one auto-revision with revision notes → still below → surface scores + notes to the user with
  "Regenerate" / "Edit manually".

## 6. Data model (2 tables)

### projects
- `id` uuid PK · `idea` text · `title` text · `status` enum
  (active | done | failed) · `stage` enum (discovery | brief | script | done)
- `conversation` jsonb (array of `{ role: user|assistant, content, at }`)
- `brief` jsonb · `brief_history` jsonb[] (append-only)
- `created_at`, `updated_at`

### scripts
- `id` uuid PK · `project_id` uuid FK →projects · `version` int · `content` jsonb
  (`{ title, hook, introduction, body, conclusion, cta }`) · `review_scores` jsonb ·
  `review_notes` text · `created_by` enum (ai | user) · `created_at`
- Unique: `(project_id, version)` · Index: `(project_id, version DESC)`
- The approved script = latest version row (no separate status column needed for the slice).

## 7. API (slice subset — full detail in api-design.md)

- `POST /api/projects` — `{ idea }` → creates project, starts discovery. Returns project.
- `GET /api/projects` — list. `GET /api/projects/:id` — full state (conversation, brief, script,
  stage).
- `POST /api/projects/:id/messages` — `{ content }` → user's answer in the interview; the agent
  either asks more or emits the brief.
- `POST /api/projects/:id/stages/script/approve` — `{ approved, feedback?, edits? }` → resume thread.
- `POST /api/projects/:id/stages/script/regenerate` — re-run script node (retry / override).
- `PUT /api/projects/:id/scripts/:scriptId` — user edit → new `scripts` row (`created_by: user`).
- `GET /api/projects/:id/stream` — SSE: `stage:started | stage:progress | agent:delta |
  stage:awaiting_review | stage:done | stage:failed`.
- `GET /api/health`.

No auth headers. No idempotency keys needed (single user, no double-submit risk beyond what the UI
debounces).

## 8. UI (per ui-design.md — "The Cutting Room")

- **Dashboard:** idea input hero + project slate cards (title, stage timecode, updated, status).
- **Workspace:** slate/timecode stage stepper, main panel per stage, "Coverage" rail (suggestions,
  scores, versions), approval bar, REC dot while agents run.
- **Discovery:** chat list (mono timestamps) + input; brief preview card appears when ready.
- **Brief review:** structured cards, inline edit, regenerate button, approve.
- **Script editor:** TipTap on paper; Coverage rail shows scores (per-dimension bars), revision
  notes, version list (compare + rollback = view/save older version).
- Error states: slate "retake" style, retry action. Empty state: invite to type an idea.
- Only the token sheet's colors/type; no ad-hoc values.

## 9. Error handling

- **Provider failure / 429:** exponential backoff + fallback provider (OpenAI/Anthropic if keys
  present, else visible failure) → stage shows `RETAKE — <reason>` + Retry.
- **Malformed AI output:** Zod validation → one re-parse → typed failure.
- **Interrupt integrity:** resume maps to the right thread; resuming a thread with no pending
  interrupt returns `409 CONFLICT`.
- **No silent continuation** anywhere (quality-gates.md).

## 10. Testing (per testing-strategy.md)

- **Workflow (critical):** FakeProvider — happy path (idea→approved script), interview→brief round
  trip, reject→regenerate loop, approve→resume, provider failure→retry, garbage output→typed
  failure, interrupt survives process "restart" via checkpointer.
- **Integration:** Fastify `inject` against a temp SQLite file — project CRUD, message POST, approve
  resume, version create.
- **Unit:** providers (mocked HTTP), zod parsers, scoring aggregation.
- **E2E (Playwright):** one flow — idea → answer questions → approve brief → script scores render →
  edit → approve → stage done. **Dev-server preview must render with no
  console/page errors.**

## 11. Success criteria

1. A user goes from one line of text to an **approved, quality-scored script** on a local machine.
2. Every script change is a version; viewing/rolling back works.
3. Weak scripts trigger revision suggestions; regeneration is targeted, not project-wide.
4. Provider swap is config (proven by FakeProvider-driven tests).
5. Failures are visible and retryable; no state lost.

## 12. Decisions (locked 2026-08-03 by user)

1. **Research stage:** → **Dropped (2026-08-03, user)** — the slice is now idea → brief → script →
   review; the reviewer scores clarity/pacing/engagement/retention/redundancy without a research
   packet to check facts against. Research returns in the full Phase 1+2 build (phase-1-foundation-design.md).
2. **Storage:** → **SQLite via better-sqlite3, no containers (ADR-014)** — Drizzle in sqlite
   dialect, LangGraph `SqliteSaver` checkpointer on the same file. The user accepted the less
   battle-tested SQLite checkpointer in exchange for zero container dependency. Postgres returns in
   the full Phase 1+2 build (ADR-004/ADR-011).
3. **Design:** → **"The Cutting Room" tokens apply to the slice UI** (approved).
4. **ORM:** → **Drizzle (ADR-013)** — shared with the full build.
5. **Auth:** none in the slice by design — Better Auth (ADR-012) lands with the full Phase 1+2 build.

Remaining open: product name (working title `videogen`).
