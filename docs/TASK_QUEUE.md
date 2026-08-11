# Task Queue — living source of truth

> **Core practice (user, 2026-08):** after EVERY task, update this file — mark the
> task done, log the follow-up recommendation, then move to the next item at the
> top of the queue. Push updates to `github.com/Joshua-Onyekachukwu/slate`
> regularly. Nothing lands on `main` unless the gate is green (typecheck +
> full test suite + docs guard). We clear the queue one task at a time.

## Queue — top of the queue is the next task

1. **Deploy on Vercel (user action)** — follow `docs/deploy.md`: Neon
   DATABASE_URL → Render API → Vercel web → Clerk keys. I've made everything
   env-driven (CORS_ORIGIN hardening included) and verified `next build`.
   Then drive the live flow + sign up a dummy user (steps in deploy.md).
2. **Re-enable local testing (user call)** — Docker/Postgres suites are on
   hold; CI runs them online on every push. When you say go, I re-run the
   local gate (unit + E2E).
3. **Phase 3 Block 1 — media generation** (next build task): per-scene image/
   video/voice generation behind the provider interface + quality gates +
   FFmpeg render/export — the path to actually "making videos".
4. **Admin dashboard** — plan locked in `docs/admin-dashboard-plan.md`
   (requireAdmin hook + read endpoints + admin pages; build after MVP is live).

## Completed — newest first

- [x] **Landing redesign (visuals + 5-phase pipeline) + Vercel deploy prep** (2026-08-11)
  - Landing now leads with **visuals built from the product itself**: a hero
    contact-sheet film strip (CSS "stills", sprocket holes, timecodes), a
    workspace product shot (script on paper + coverage rail mock reusing the
    real token classes), and per-phase mini mocks (brief cards, research
    timeline, script scores, slate lines, asset chips). No stock images.
  - Pipeline restructured from 11 stages → **5 phases** (Conceive / Research /
    Write / Plan / Produce — the last tagged Phase 3) per review feedback.
  - **Deploy prep:** `next build` verified clean (5 routes + middleware); API
    CORS hardened with env-driven `CORS_ORIGIN` (local-first default
    preserved, tests unaffected); `.env.example` rewritten as the full
    local + deploy contract; **`docs/deploy.md`** (Neon → Render → Vercel →
    Clerk → NVIDIA → dummy user → verification) and
    **`docs/admin-dashboard-plan.md`** (plan only — build later) added.
  - **Testing on hold per user instruction** (Docker shut down): verified
    web + api typecheck and the docs guard only; E2E/unit suites deferred —
    CI runs them online on the next push (its own Postgres service container).
  - **Follow-up recommendation:** deploy per deploy.md, sign up a dummy user,
    drive idea → research → script → storyboard live; then Phase 3 Block 1
    (media generation) is the next build task toward making real videos.

- [x] **Landing page + studio split + auth wiring** (2026-08-11, gate green)
  - Competitive review (OpenArt, Pika, Runway): prompt-first hero, director-led
    messaging, model trust strip — no generic SaaS patterns.
  - The studio (dashboard) moved from `/` to **`/studio`** (git mv + relative
    import fix); `/` is now the public **Cutting Room landing page**: hero with
    real prompt input + timecode frame, model trust strip (NVIDIA Build ·
    OpenAI · Anthropic · FFmpeg), the 11-stage production pipeline as slate
    stages (Generation/Render/Export tagged Phase 3), the "You direct. The
    crew executes." gate cards (approve / retake), six feature cards drawn from
    what's actually built, CTA, mono footer. Ink/tungsten/REC tokens only.
  - **Auth:** middleware now protects `/studio` + `/projects` (`/` stays
    public); landing CTAs route to `/sign-up` when Clerk keys are present,
    `/studio` in local demo mode (env-gated, ADR-022/023 unchanged). Nav:
    Studio → `/studio`, landing CTA (Open studio) in local mode.
  - **The long-interrupted auth E2E debug is CLOSED:** the stub-mode middleware
    fix (plain redirect, no clerkMiddleware handshake) + `STUB_AUTH=1` web env
    in playwright.auth.config.ts now passes **3/3** — and the spec was extended
    to assert `/` is public while `/studio` 307s to `/sign-in`. Also fixed a
    strict-mode collision (nav brand vs auth-brand "slate").
  - **Review gate:** full gate green — typecheck 6/6 · unit suites · docs guard
    · main E2E **14/14** (incl. 3 NEW landing viewports at 1440/834/390,
    zero-overflow) · auth E2E **3/3**. Docker daemon was stopped after the tab
    reopened; restarted Docker Desktop + `slate-pg` to run the gate.
  - **Follow-up recommendation:** review the landing in the preview (stack is
    booted, registered); then land the whole pending tree as scoped commits
    (landing + studio split, auth E2E spec, Task 12 hardening, demo-queue,
    test:unit, CI concurrency already pushed as `cfbd912`). Phase 3 (media
    generation + quality gates) is next on the roadmap.

- [x] **Task 12 hardening — auth isolation + reorder 409** (2026-08-11, gate green)
  - Auth isolation (ADR-023): `auth.test.ts` sweep — user A drives a project to
    a storyboard; user B (separate bearer token via the fake verifier) **404s on
    every owner-scoped route** and never sees the project in `GET /projects`.
  - Reorder 409: `routes/storyboard.ts` — `scene_ids` set mismatch → **409
    CONFLICT** (structural invalids stay 400); tests in `app.test.ts`.
  - `production-plan.test.ts` bullet: covered by `graph.test.ts` (storyboard
    reject loop) + `interrupt.test.ts` (rebuild persistence) — no duplicate.
  - **Review gate (surfaced + fixed a real defect):** the uncommitted
    `auth.spec.ts` lives in `tests/e2e/`, so the MAIN playwright config swept it
    in and failed 3 tests (it needs the auth config's STUB_AUTH boot). Fix:
    `testIgnore: /auth\.spec\.ts/` in `playwright.config.ts`. After the fix:
    **typecheck 6/6 · shared 5/5 · db 12/12 · ai 21/21 · api 32/32 · docs clean
    · E2E 11/11** (one journey-test flake on an intermediate run — timing,
    passed on re-run).
  - **Follow-up recommendation:** land the pending scoped commits (Task 12
    files + the auth E2E spec once its web leg is debugged), then start
    Phase 3 — per-scene media generation + quality gates.

- [x] **Live-Clerk boot tooling — `scripts/boot-live.sh`** (2026-08-11)
  - Boots API :4101 + web :3001 in **enforced auth mode**: sources the root
    `.env`, requires `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
    (fails fast with the exact file path if missing), defaults DATABASE_URL to
    compose Postgres `slate_live`, and uses FakeProvider for content when no
    NVIDIA key is set (auth stays real). Demo stack (boot-slice.sh :4100/:3000)
    untouched.
  - **BLOCKED drive:** the actual live walk (sign-up → project → script gate →
    approve) still can't run — no `.env` has ever landed in this workspace
    (checked 4×: root, apps, HOME, gitignored view, Webstrom/Webstorm folders).
    `bash -n` clean; script is ready the moment the file exists.
  - **Follow-up recommendation:** once `.env` is confirmed on disk at
    `C:\Users\Semek\Webstrom\videogen\.env`, run `bash scripts/boot-live.sh`
    and drive the flow; if the file still won't appear, paste the two Clerk
    keys directly and I'll boot with exported vars instead.

- [x] **Unit-only root test script — `test:unit` (turbo `--filter=!@slate/e2e`) + lint-staged retarget** (2026-08-11)
  - Added `"test:unit": "turbo run test --filter=!@slate/e2e"`; lint-staged's
    test rule now runs `pnpm test:unit` instead of `pnpm test`, so pre-commit
    stays fast and never boots the E2E/dev-server stack.
  - **Filter correction:** the e2e package is named `@slate/e2e`, so the literal
    `--filter=!e2e` fails (`No package found with name 'e2e'` — verified
    empirically); `!@slate/e2e` scopes to exactly the 6 unit packages
    (ai, api, db, shared, web, worker) minus e2e (dry-run verified).
  - Verified: `pnpm test:unit` runs 4/5 tasks (one api test 5s timeout under
    parallel load); api suite re-run in isolation **32/32 green** — flake, not
    a defect. `pnpm test` (full incl. E2E) unchanged for CI.
  - **Follow-up recommendation:** consider raising vitest `testTimeout` (or the
    api suite's heavy auth-isolation tests) so the parallel `pnpm test:unit`
    run is flake-free under load.

- [x] **Husky v10 shim deprecation — verified already fixed, re-verified with extended gate** (2026-08-11)
  - `.husky/pre-commit` is the v10-style hook (`pnpm exec lint-staged`, no shebang,
    no `_/husky.sh` source) since `b56855e` (on origin). No tracked file sources
    the gitignored `_/husky.sh` stub; `~/.huskyrc` absent (the other v9 warning source).
  - Empirical re-run with the now-heavier gate (lint-staged → `pnpm check:docs`):
    EXIT 0, **zero husky/deprecation warnings** through the exact path git invokes
    (`core.hooksPath` → `.husky/_/pre-commit` → `h` → user hook).
  - Only warning observed is git's CRLF autocrlf notice (`LF will be replaced by CRLF`)
    — cosmetic Windows artifact, unrelated to husky.
  - **Follow-up recommendation:** if a husky-branded warning ever appears on another
    machine, run `pnpm install` (prepare script regenerates the gitignored `.husky/_`)
    — the repo itself needs no change.

- [x] **CI concurrency + PR dedup — `.github/workflows/ci.yml`** (2026-08-11)
  - `pull_request` trigger was already present; added a top-level `concurrency`
    block (`group: ci-${{ github.workflow }}-${{ github.ref }}`,
    `cancel-in-progress: true`) so each branch/PR merge ref keeps exactly one
    live run — new pushes cancel the in-flight run instead of queueing
    redundant builds, so branch-protection's required check always reflects the
    freshest commit.
  - Verified: YAML parses clean (top-level keys name/on/concurrency/jobs;
    group + cancel-in-progress values confirmed).
  - Committed `cfbd912` (scoped, ci.yml only) and pushed; CI run
    31461085101 **fully green** — typecheck, tests, and docs guard all pass
    on the new master head.
  - **Follow-up recommendation:** on the next PR, push a second commit and
    confirm the first run shows "cancelled" in Actions; optionally add
    `actionlint` to the pre-commit gate so workflow syntax is linted locally.

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
