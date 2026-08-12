# Task Queue — living source of truth

> **Core practice (user, 2026-08):** after EVERY task, update this file — mark the
> task done, log the follow-up recommendation, then move to the next item at the
> top of the queue. Push updates to `github.com/Joshua-Onyekachukwu/slate`
> regularly. Nothing lands on `main` unless the gate is green (typecheck +
> full test suite + docs guard). We clear the queue one task at a time.

## Queue — top of the queue is the next task

1. **Deploy on Vercel (user action)** — follow `docs/deploy.md`: Neon
   DATABASE_URL → Render API → Vercel web → Clerk keys (env-driven + `next
   build` verified). Then drive the live flow + sign up a dummy user.
2. **Phase 3 Block 3 — real NVIDIA media endpoints** behind
   generateImage/Video/Voiceover/Music (currently typed NOT_SUPPORTED) + voice
   over / music providers as they become available.
3. **Phase 3 Block 4 — FFmpeg render/export**: stitch approved assets, captions,
   transitions, audio mix → MP4 + thumbnail + project package.
4. **Admin dashboard** — plan locked in `docs/admin-dashboard-plan.md`
   (requireAdmin hook + read endpoints + admin pages; build after MVP is live).

## Completed — newest first

- [x] **E2E: assert the consolidated production-plan payload** (2026-08-12)
  - The vertical-slice spec now GETs `/production-plan` after storyboard approve
    and asserts the Task 10 contract: `stage: "done"` (checkpoint-derived),
    `productionPlanStatus: "ready"`, the DRAGGED scene order
    [Scene 2 (rev), Scene 3 (rev), Scene 1 (rev)] in the payload, and the
    cast/locations records. Main E2E still 14/14.

- [x] **Demo-queue smoke as an automated spec** (2026-08-12)
  - `tests/playwright.demo.config.ts` — sibling config that boots the API with
    `FAKE_PROVIDER=1 DEMO_QUEUE=1` (hermetic `slate_test_demo` DB, API :4002,
    web :3000) + `tests/e2e/demo-smoke.spec.ts` asserting the demo journey:
    research gate → script v1 (2/5) → retake with feedback → v2 (4/5) →
    approve → storyboard gate v1 (crew sheet in the rail), zero console errors.
  - `pnpm test:e2e:demo` (tests package + root); demo-smoke is EXCLUDED from
    the main config (testIgnore) so it can never consume the E2E queue.
  - Gate: demo smoke 1/1 · main E2E still 14/14 · typecheck 6/6. First pass
    caught a strict-mode collision (brief card vs page title → exact: true).

- [x] **Task 12 hardening — auth-sweep extended to the Block 1 assets routes** (2026-08-12)
  - The owner-scoped 404 sweep in `auth.test.ts` (user B on every route after A
    drives to a storyboard) predated Phase 3 Block 1; added `GET` + `POST
    /scenes/:id/assets` to it. api 36/36 · typecheck · docs guard green.
  - Reorder `scene_ids` mismatch 409 + auth isolation were already shipped in
    `c951c74` (per the standing rule, moved past the done work, closed the gap).

- [x] **Phase 3 Block 2 — asset UI in the scene card + per-asset quality gate (TDD + review gate)** (2026-08-11)
  - **Quality gate on the provider** (`packages/ai`): `MediaArtifact.quality`
    (`{ score 1–5, notes[] }`); FakeProvider scores DETERMINISTICALLY from the
    same prompt seed (same prompt → same score → idempotent retry), spread 2–5.
  - **API** (`apps/api`): the assets POST persists `meta.quality` from the
    artifact; GET returns it. The gate is visible + retryable, never silent.
  - **Web** (`apps/web`): per-scene `Assets` strip under every scene card — one
    generate button per kind (IMG/VID/VO/MUS), score shown once ready, low
    (< 3) flags regeneration, FAILED becomes a retry with the error as title.
    `api.ts` grew `Asset`/`ASSET_KINDS`/`listAssets`/`generateAsset`; version
    bumps (edit/regen/reorder/pack-edit) reset the per-scene map (new ids).
  - **Tests**: ai 24/24 (deterministic quality) · api 36/36 (meta.quality
    persisted) · E2E 14/14 (vertical-slice now generates an IMG at the gate
    and asserts the `IMG · X/5` chip before any version bump).
  - **Hardening**: api vitest `testTimeout` 5s → 15s — the first full-graph
    run in a file (create → research gate) flakes at ~6.4s under load while
    passing comfortably in CI; 15s keeps the gate honest without masking hangs.
  - **Follow-up recommendation**: Block 3 — real NVIDIA media endpoints (the
    quality gate is then a real eval; FakeProvider's deterministic score stays
    for tests).

- [x] **Phase 3 Block 1 — asset generation foundation (backend, TDD + review gate)** (2026-08-11)
  - **Provider media methods** (`packages/ai`): `generateImage / generateVideo /
    generateVoiceover / generateMusic` on the `Provider` interface (Phase 1+2
    was chat-only). FakeProvider returns deterministic, hash-stable artifacts
    (`fake://image/<hash>.png` — same prompt → same URL, idempotent retries);
    NvidiaProvider throws typed `NOT_SUPPORTED` until a real media endpoint is
    wired (Block 3).
  - **`assets` table** (`packages/db`): scene-scoped rows (kind, status, url,
    mime, provider, meta, error) + migration `0001_assets.sql`; version-rows
    philosophy — a storyboard bump mints new scene ids and the current scene's
    list starts fresh, old rows persist.
  - **Asset API** (`apps/api/routes/assets.ts`): `GET/POST
    /projects/:id/scenes/:sceneId/assets` — owner-scoped (getOwnedProject), 409
    no-storyboard (before scene-id validation, matching the prompts routes),
    400 invalid kind, 404 missing scene/foreign project, 409 no prompt pack
    (edited scenes), provider failure persists a **failed** row + 502
    (retryable, never a silent 500). New `PROVIDER_FAILURE` error code.
  - **Review gate caught a real defect twice:** garbage (non-uuid) scene ids hit
    Postgres' uuid type-cast → 500 (fixed with `UUID_RE` guard), then the guard
    ordering flipped the no-storyboard 409 → 404 (fixed by checking the
    storyboard first). Final gate: typecheck 6/6 · shared 5/5 · db 14/14 ·
    ai 23/23 · api 36/36 · docs guard clean. (db suite flaked once under
    parallel load — 10s hook timeout, passed 14/14 in isolation; same known
    flake class.)
  - **UI deliberately deferred to Block 2** — this block is fully unit-gated;
    the running demo stack was not touched.
  - **Follow-up recommendation:** Block 2 = asset UI (generate buttons + status
    chips in the scene card) + per-asset quality gate, then Block 3 real media
    endpoints, then Block 4 FFmpeg render/export.

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
  - **Version pin + next-bump migration (2026-08-12):** `package.json` pins
    `"husky": "^9.1.7"` — the caret admits v10 on any install that regenerates
    the lockfile (the exact path this deprecation came through). The hook is
    **already v10-format**, so a v10 bump is a no-op migration: no `.husky`
    change needed, verified zero warnings through git's exact invocation path.
  - **CI needs no pin:** `.github/workflows/ci.yml` never invokes husky or the
    pre-commit hook — it runs `pnpm install --frozen-lockfile` → typecheck →
    tests → docs guard directly. The hook is local-only by design.
  - **Next bump:** at leisure, pin `"husky": "^10.0.0"` (or drop the pin and
    let corepack resolve) — the hook works unchanged. If a husky-branded
    warning ever appears on another machine first, run `pnpm install` (prepare
    regenerates the gitignored `.husky/_`) — the repo itself needs no change.

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
