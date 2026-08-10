# Task Queue — living source of truth

> **Core practice (user, 2026-08):** after EVERY task, update this file — mark the
> task done, log the follow-up recommendation, then move to the next item at the
> top of the queue. Push updates to `github.com/Joshua-Onyekachukwu/slate`
> regularly. Nothing lands on `main` unless the gate is green (typecheck +
> full test suite + docs guard). We clear the queue one task at a time.

## Queue — top of the queue is the next task

- [ ] **Task 12 hardening — auth isolation + reorder 409 + production-plan workflow test**
  (plan §Task 12, `packages/ai` + `apps/api`)
  - Auth isolation (ADR-023): user A drives a project to a storyboard; user B
    (separate bearer token via the fake verifier) gets **404 on every
    owner-scoped route** and does **not** see the project in `GET /projects`.
  - Reorder 409: `PUT .../storyboard/order` with a `scene_ids` set that doesn't
    match the server set → **409 CONFLICT** (existing 409s cover "no pending
    interrupt" and "no storyboard yet"; the id-set mismatch path is open).
  - `packages/ai/src/workflow/production-plan.test.ts`: storyboard gate reject
    loop + interrupt persistence across a graph rebuild.
  - TDD + review gate, then pause for checkpoint.

## Completed — newest first

- [x] **Manual prompt-pack edit — `PUT /projects/:id/scenes/:sceneId/prompts`**
  (2026-08-10)
  - Endpoint in `apps/api/src/routes/prompts.ts` (full storyboard version bump,
    user pack swapped in for the target scene, `{ storyboard }` response —
    matching the shipped regenerate/edit/reorder version-rows model; the plan's
    single-row sketch would duplicate the scene in `loadStoryboard`).
  - Web: `saveScenePrompts` client method + Edit/Save/Cancel pack fields in the
    Advanced panel (`workspace.tsx`, `.pack-input` styles).
  - TDD: 3 API tests (happy path v-bump + pack swap, 400 invalid pack,
    409/404 guards). Verified: API 29/29, typecheck 6/6, E2E 11/11.
  - **Follow-up recommendation:** drive the pack edit through the live preview
    (boot demo stack, edit a pack at the storyboard gate, confirm sb version
    bump persists) — the E2E covers it headlessly, but a human click-through
    was not yet done. → queue candidate once the preview is next booted.

## Working agreement (standing rules from the project)

- Ground truth first: check git status / origin before any build or commit.
- One recommendation at a time for a task — await approval, then execute.
- If an instruction repeats work already done or contradicts a concluded
  decision, move past it to the next genuinely open task.
- TDD + review gate on every build task; pre-commit hook runs the docs guard,
  and the pre-push gate is typecheck + unit suites + E2E.
- The vertical slice + Phase 1+2 build are on `master`; Docker Postgres
  (`slate-pg`) is required for the Postgres-backed suites/E2E.
