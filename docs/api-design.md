# API Design

> Status: **Draft** · Last updated: 2026-08-03 · REST over Fastify. Companion:
> `database-schema.md`, `ai-pipeline.md`.

## Conventions

- Base URL: `/api/v1` (versioned from day one).
- JSON everywhere; errors follow a single shape (below).
- Auth: **Clerk in Phase 1+2 (ADR-012/023)** - multi-user isolation from day one. Every
  `/api/v1` route requires a valid Clerk session JWT (verified in a `requireUser` hook) and scopes by
  `owner_id`; cross-user access returns `404` (never `403`, to avoid leaking existence); unauthenticated
  calls return `401 UNAUTHORIZED`.
- IDs: uuid. Timestamps: ISO-8601 UTC.
- Statuses use the shared enums from `packages/shared`.
- **Idempotency:** job-kickoff endpoints accept an `Idempotency-Key` header; retries don't double-enqueue.
- **No long-lived HTTP connections during human review.** The workflow persists and exits; approval
  endpoints resume it (see ai-pipeline.md).

## Error shape

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project does not exist.",
    "details": {}
  }
}
```

Common codes: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`,
`RATE_LIMITED`, `PROVIDER_ERROR`, `INTERNAL`.

## Phase 1 endpoints (current scope)

### Auth (in scope - ADR-023)
Clerk is a managed provider: sign-up/sign-in/sign-out run on Clerk-hosted pages (catch-all routes
`/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]` on the web); the app holds **no local auth
tables**. The API side uses a `requireUser` Fastify hook that verifies the Clerk session JWT
(`verifyToken`, injectable for tests) and attaches the user id to the request; every project route
fetches via a shared `getOwnedProject(userId, id)` gate → `404` when the project isn't owned. The
web sends the Clerk session token as `Authorization: Bearer …` on every `/api/v1` call.

### Projects
- `POST /api/v1/projects` - create from an idea. Body: `{ idea: string, settings?: {...} }`.
  Creates project + conversation, kicks off the Planning Agent, returns project.
- `GET /api/v1/projects` - list (dashboard). Query: `status`, `page`, `limit`.
- `GET /api/v1/projects/:id` - project + stage statuses (for the workspace header).
- `DELETE /api/v1/projects/:id` - soft-delete (trash, not gone; R2 assets unlinked).

### Conversations (Creative Discovery)
- `GET /api/v1/projects/:id/conversation` - messages, paginated.
- `POST /api/v1/projects/:id/messages` - user reply. Body: `{ content }`. If the Planning Agent
  needs another clarification, this continues the interview; otherwise it finalizes the brief.

### Stages (the workflow surface)
- `GET /api/v1/projects/:id/stages` - list of stage cards: `{ stage, status, version, updatedAt }`.
- `GET /api/v1/projects/:id/stages/:stage` - full stage content + metadata (e.g., the brief object,
  the script + its review scores).
- `POST /api/v1/projects/:id/stages/:stage/approve` - body:
  `{ approved: boolean, feedback?: string, edits?: {...} }`. Resumes the LangGraph thread with
  `Command(resume=...)`. Approved=false routes back to the producing node with feedback.
- `POST /api/v1/projects/:id/stages/:stage/regenerate` - same mutation path as approve-reject:
  resumes the gate with `{ approved: false, feedback ?? "regenerate" }` (retry after provider
  failure or quality-gate rejection) - see the exact contract below.

### Stage approve / regenerate - exact contract (UI-facing)

> The slice has **two interrupt points**: the discovery interview (`discovery_questions`, answered
> via `POST /messages`) and the script review gate (`script_review`). The approve/regenerate routes
> below apply to **gate pauses only** (`script_review`). Both routes resume the **same persisted
> LangGraph thread** and are the only mutation paths - the graph's script node is the only place a
> new script version is written (`saveScript`), so approve-reject and regenerate can never
> double-fire. Request/response shapes below are the contract the UI builds against; implementation
> notes live in the vertical-slice plan, Task 7.

#### `POST /api/v1/projects/:id/stages/:stage/approve`

Resumes the thread at the gate with the human decision.

Request body:

```json
{
  "approved": true,
  "feedback": "optional note; only consumed when approved=false"
}
```

| Status | When | Body |
|---|---|---|
| `200` | Gate resumed | `{ project, stage }` (stage payload below) |
| `400` | `approved` missing or not boolean; unknown `:stage` | error shape, `VALIDATION_ERROR` |
| `404` | Project does not exist | error shape, `NOT_FOUND` |
| `409` | Thread **not paused** at this gate (mid-run, already done, or paused at a different gate) | error shape, `CONFLICT` |

Semantics:

- `approved: true` → gate returns `{ stage: "done" }`; workflow finishes.
- `approved: false` → gate returns `{ feedback, stage: "script" }`; workflow re-runs the script
  agent with the feedback, re-reviews, and pauses at the gate again - new script version.

#### `POST /api/v1/projects/:id/stages/:stage/regenerate`

Re-runs the producing node. Implemented as **one code path with approve-reject**: resumes the
*same* gate with `{ approved: false, feedback: body.feedback ?? "regenerate" }` (identical to
Task 6's reject loop). No other mutation happens.

Request body (optional):

```json
{ "feedback": "optional note" }
```

| Status | When | Body |
|---|---|---|
| `200` | Gate resumed | `{ project, stage }` |
| `404` | Project does not exist | error shape, `NOT_FOUND` |
| `409` | Thread not paused at this gate (mid-run, already done) | error shape, `CONFLICT` |

#### Stage payload (returned by both routes and `GET .../stages`)

```json
{
  "project": {
    "id": "4c1e…",
    "stage": "script_review",
    "status": "active"
  },
  "stage": {
    "key": "script",
    "status": "awaiting_review",
    "version": 2,
    "updatedAt": "2026-08-04T12:00:00.000Z",
    "gate": { "value": "script_review" }
  }
}
```

- `status` uses `StageStatus` from `@slate/shared`: `idle | running | awaiting_review | approved | failed`.
- `gate.value` is the interrupt payload (from `getState().tasks[].interrupts[0].value`  - 
  `"script_review"` for the script gate, `"discovery_questions"` for the interview). It tells the
  UI *which* gate is asking, so it can render the right controls.
- `version` is the latest script version; it increments on every regenerate/reject round-trip
  (the UI uses it to refresh the editor and show "v2, v3, …").
- `project.stage` is the workflow's `stage` channel, read from the checkpoint
  (`getState(thread).values.stage`) - **not** the `projects.stage` column, which `saveProject` only
  patches lazily (discovery writes `brief`; the script node never patches the column). In the slice
  the channel reads `script_review` while paused at the script gate (the `review` node wrote it just
  before the gate's `interrupt()`), `done` after approval. The route param `:stage` uses the
  *producing* stage (`script`); the channel value may differ - treat `gate.value` as the gate
  identity and `project.stage` as the stepper position.

**UI rule:** poll `GET /api/v1/projects/:id/stages` (or the SSE stream). Render the
approve/regenerate controls only while `stage.status === "awaiting_review"` **and**
`stage.gate.value === "script_review"`. When `gate.value === "discovery_questions"`, the pause is
an interview question - show an answer box that posts to `POST /api/v1/projects/:id/messages`
instead. A `409 CONFLICT` from either approve/regenerate route means the stage is still running  - 
retry after the next poll.

### Script editing
- `PUT /api/v1/projects/:id/scripts/:scriptId/versions` - save user edits as a new version
  (`created_by: "user"`). Rollback = restore an older version → new version row.
- `GET /api/v1/projects/:id/scripts/:scriptId/versions` - compare list.

### Jobs
- `GET /api/v1/jobs/:id` - status of any background job.
- `GET /api/v1/projects/:id/jobs` - recent jobs (activity feed).

### Streaming / progress
- `GET /api/v1/projects/:id/stream` - SSE: stage transitions, agent progress, token deltas
  (token deltas optional in Phase 1; stage progress required).

### Storyboard & scenes (Phase 1+2 additions)
- `GET /api/v1/projects/:id/storyboard` - scenes (latest versions, ordered).
- `POST /api/v1/projects/:id/stages/storyboard/approve` - `{ approved, feedback? }` → resume thread.
- `POST /api/v1/projects/:id/stages/storyboard/regenerate` - re-run Storyboard agent.
- `PUT /api/v1/projects/:id/scenes/:sceneId` - edit scene content → new version row.
- `PUT /api/v1/projects/:id/storyboard/order` - `{ scene_ids: [...] }` → reorder (atomic, one txn).
- `POST /api/v1/projects/:id/scenes/:sceneId/prompts/regenerate` - regenerate that scene's prompt pack.
- `PUT /api/v1/projects/:id/scenes/:sceneId/prompts` - manual prompt pack edit.
- `GET /api/v1/projects/:id/production-plan` - consolidated read-only view (script + scenes + prompts).

### Health
- `GET /api/v1/health` - liveness + DB status.

## Later-phase endpoints (reserved, not built now)

- `POST .../scenes/:id/generate`, `.../assets` (Phase 3)
- `POST .../render`, `GET .../exports/:id/download` (Phase 4)

## SSE semantics

- One SSE connection per project view. Events: `stage:started`, `stage:progress` (0–100),
  `agent:delta` (text chunk), `stage:awaiting_review`, `stage:failed` (`{ error }`), `stage:done`.
- Client reconnects with `Last-Event-ID` = last received event id; server replays missed events
  from project logs. SSE connections are cheap; state lives in Postgres, not the socket.

## Webhook/worker callbacks (internal)

- Workers push job completion into Postgres; the API reads Postgres for SSE fan-out. No external
  webhooks needed in Phase 1.

## Rate limiting & safety

- Rate limit on AI-kickoff endpoints; `429 RATE_LIMITED` with `Retry-After` (per-user limits in
  place from day one, ADR-022).
- All provider calls run inside jobs with retry/backoff (see ai-pipeline.md); the API never blocks
  on a provider call synchronously for long generations.
