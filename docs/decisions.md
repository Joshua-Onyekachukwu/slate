# Decisions (Architecture Decision Records)

> Status: **Draft** · Last updated: 2026-08-03 · New decisions are appended here in ADR format.
> Statuses: `Accepted` (locked), `Proposed` (in review), `Superseded`.

---

## ADR-001 · Monorepo with pnpm workspaces + Turborepo

- **Status:** Proposed
- **Context:** The project needs a shared frontend, API, workers, and AI packages with shared types.
- **Decision:** `apps/web`, `apps/api`, `apps/worker`, `packages/ai`, `packages/db`, `packages/shared`,
  managed with pnpm workspaces; Turborepo for task caching (dev/build/typecheck/test per package).
- **Consequences:** One lockfile, shared deps, fast CI; adds monorepo tooling complexity (small for a
  solo project).

## ADR-002 · Provider abstraction for all AI calls

- **Status:** Accepted (core principle of the vision)
- **Context:** "The workflow should remain model-agnostic so providers can be swapped later."
- **Decision:** A `Provider` interface (`chat`, `complete` with schema validation, `embed`) in
  `packages/ai`. All agents depend on the interface + a routing config, never an SDK. NVIDIA Build is
  the first implementation (OpenAI-compatible); OpenAI/Anthropic follow; Gemini/Together/Fireworks later.
- **Consequences:** Swapping models is config, not surgery. Slight indirection cost; high resilience value.

## ADR-003 · LangGraph.js as the workflow engine

- **Status:** Accepted (explicit in vision)
- **Context:** Multi-stage creative pipeline with human approval gates between stages.
- **Decision:** LangGraph.js graph per project; typed state channels; Postgres-backed checkpointer;
  review gates via `interrupt()`/`interruptAfter`; resume via `Command(resume=...)`. `thread_id`
  = project id. The graph persists and exits during human review (no long-lived HTTP).
- **Consequences:** Proven HITL pattern; state survives restarts. langgraph.js is production-ready
  for standard orchestrations (Python has richer advanced features - acceptable).

## ADR-004 · Postgres as workflow checkpoint + source of truth

- **Status:** Accepted
- **Context:** Graph state must survive restarts and map to projects.
- **Decision:** Postgres checkpointer for LangGraph; all business data in Postgres; R2 only for bytes.
- **Consequences:** Single database to operate; state and data consistent in one transaction domain.

## ADR-005 · NVIDIA Build as primary provider (dev tier)

- **Status:** Accepted (with guardrails)
- **Context:** Free OpenAI-compatible hosted models (~40 RPM) - ideal for a personal project.
- **Decision:** Primary = NVIDIA Build; strict exponential backoff + jitter, circuit breaker,
  fallback to OpenAI/Anthropic on 429/5xx. Heavy media generation deferred to Phase 3 planning.
- **Consequences:** $0 orchestration cost in Phases 1–2; rate-limit handling is a first-class concern.

## ADR-006 · BullMQ + Redis for background jobs

- **Status:** Accepted
- **Context:** Research/script/media/render/export can take minutes; must survive restarts and retry.
- **Decision:** BullMQ queues (`research`, `script`, `storyboard`, `image`, `video`, `voice`,
  `render`, `export`), Redis as broker, worker processes in `apps/worker`.
- **Consequences:** Durable jobs, retries, visibility; Redis is a second infra dependency (Docker).

## ADR-007 · Cloudflare R2 for object storage

- **Status:** Accepted (vision)
- **Context:** Generated assets and exports need cheap, durable storage.
- **Decision:** R2 buckets: `images`, `videos`, `voice`, `music`, `exports`, `thumbnails`. DB stores
  keys; downloads via presigned URLs. S3-compatible SDK.
- **Consequences:** No egress fees (vs S3); requires an R2 account + keys.

## ADR-008 · FFmpeg for video processing

- **Status:** Accepted (vision)
- **Context:** Stitching scenes, captions, transitions, audio mixing, compression, export.
- **Decision:** FFmpeg (spawned via node) in render jobs. Detailed render command templates live in
  `packages/ai` (render module) and are versioned.
- **Consequences:** Powerful but sharp-edged; render pipelines are tested with golden fixtures.

## ADR-009 · TipTap for the script editor

- **Status:** Accepted (vision)
- **Context:** Scripts must be fully editable with structure (hook/intro/body/conclusion/CTA).
- **Decision:** TipTap (ProseMirror) with structured blocks per script section; saves create new
  versions (`created_by: user`).
- **Consequences:** Rich editing UX; serialization to/from the script content model must be tested.

## ADR-010 · Tailwind + shadcn/ui + Framer Motion, token-driven design

- **Status:** Accepted (vision + design language); **design direction locked Final 2026-08-03**
  (user: "The Cutting Room design is approved as-is")
- **Context:** Fast, consistent UI with a distinctive visual identity.
- **Decision:** Tailwind CSS + shadcn/ui primitives + Framer Motion; all design tokens (colors, type,
  spacing) derived from the "The Cutting Room" token sheet (ui-design.md) - no ad-hoc values in
  components. The **full-system frontend prototype** (`prototypes/cutting-room-full.html`) is
  **approved as-is** and is the visual source of truth for every screen and stage (ui-design.md).
- **Consequences:** Fast iteration; requires token discipline to avoid drift. UI work ports the
  approved prototype rather than redesigning.

---

## ADR-011 · Local-first deployment, deployable later

- **Status:** Accepted (user decision 2026-08-03)
- **Context:** Personal project; wants fast iteration now, no hosting accounts or infra costs before
the product is proven. But the architecture must not paint us into a corner.
- **Decision:** Develop locally (Docker for Postgres + Redis, dev servers on localhost, secrets in
  local `.env`). Design so a later move to Vercel + Neon + R2 is **configuration, not rewrite**:
  provider abstraction (ADR-002), config-driven env vars (project-setup.md), and no dev-only
  assumptions baked into code. Phase 3+ (R2, BullMQ) keeps working locally via Docker.
- **Consequences:** Fast iteration, zero hosting cost in Phases 1–2; when we deploy, the work is
  env config + CI/CD, not architectural rework.

## ADR-012 · Better Auth for authentication (chosen; superseded by ADR-023)

- **Status:** Superseded (2026-08-04, user - managed provider chosen). The "in scope for Phase 1+2"
  clause stands via ADR-022, but the **provider choice is replaced by ADR-023 (Clerk)**. Kept as
  the historical record; do not follow.
- **Context:** Originally a self-hosted, TS-first, local-first (ADR-011) choice with a first-class
  Drizzle adapter.
- **Decision:** (Historical) Better Auth (self-hosted, cookie sessions) with the **Drizzle adapter**
  and Postgres. Email/password initially; OAuth via plugins later. Every project carries an
  `owner_id`; every query is scoped by the authenticated user.
- **Consequences:** None shipped - ADR-023 (Clerk, 2026-08-04) replaces the provider before
  implementation. The local `users`/`account`/`session` tables this ADR implied are dropped: Clerk
  owns identity and stores it in its own cloud.

## ADR-013 · Drizzle ORM

- **Status:** Accepted (user decision 2026-08-03)
- **Context:** TypeScript-first, no codegen step, maps cleanly to the jsonb/enum schema; pairs with
  Better Auth's Drizzle adapter (ADR-012).
- **Decision:** Drizzle ORM in `packages/db` (Postgres driver: `node-postgres` via `pg`), with
  `drizzle-kit` for migrations. Shared types/zod/enums stay in `packages/shared`.
- **Consequences:** Lean toolchain, SQL-adjacent queries, direct jsonb support; migrations are
  generated with `drizzle-kit` (dev: `push`; prod: `generate` + `migrate`).

## ADR-014 · SQLite for the vertical slice (zero container dependency)

- **Status:** Superseded by ADR-018 (2026-08-03), then **re-adopted by ADR-024 (2026-08-04,
  user - slice revived as the first build, SQLite locked in)**. Historical record; the slice now
  follows this ADR again.
- **Context:** The vertical slice (phase-1a) was a validation slice proving the idea → approved-script
  loop. The user wanted it to run with **no container dependency** - `pnpm dev` and nothing else.
  This deliberately traded away the less critical parts of Postgres for the slice; the user accepted
  the less battle-tested LangGraph.js SQLite checkpointer as the price.
- **Decision:** The slice ran on **SQLite via better-sqlite3**, with the LangGraph checkpointer
  `SqliteSaver` (`@langchain/langgraph-checkpoint-sqlite`) pointed at the same SQLite file, and
  Drizzle in its **sqlite dialect** (`drizzle-orm/better-sqlite3`). Slice-only decision.
- **Consequences:** Restored by ADR-024 (2026-08-04) - the slice is the first build again and
  runs zero-container on SQLite. Phase 1+2 (Postgres/Drizzle/Clerk, ADR-004/011/013/023) remains
  the documented follow-on build.

## ADR-015 · Auth deferred - Phase 1+2 is single-user with reserved owner_id

- **Status:** Accepted 2026-08-03; superseded by ADR-016 (auth restored), then **re-adopted by
  ADR-017 (2026-08-03, user - auth deferred again)**, then **superseded again by ADR-019
  (2026-08-03, user - auth restored)**. Kept as the historical record; do not follow.
- **Context:** Phase 1+2 validates the creative loop (idea → approved production plan). Auth is
  purely additive for that validation, and the user decided to defer it after the earlier "auth in
  scope" call - **reversing ADR-012's scope.**
- **Decision:** Phase 1+2 ships **single-user, no auth**. Better Auth remains the chosen provider
  for the future auth spec (the ADR-012 provider choice stands). `projects.owner_id` is created as
  a **nullable, reserved** column (indexed) so the auth spec later is a one-line backfill, not
  schema surgery. No auth routes, no session handling, no user-scoped queries in this spec.
- **Consequences:** Smaller Phase 1+2 scope; the auth spec becomes a clean layer on top. Supersedes
  ADR-012's "in scope for Phase 1+2" clause; ADR-012's provider choice (Better Auth + Drizzle
  adapter) stays in force for when auth lands.

## ADR-016 · Auth restored - multi-user isolation from day one

- **Status:** Accepted 2026-08-03, then **superseded by ADR-017 (2026-08-03, user)** - auth is
  deferred again. **Re-adopted in full by ADR-019 (2026-08-03, user)**, then **superseded again by
  ADR-021 (2026-08-04, user)**, then **re-adopted again by ADR-022 (2026-08-04, user - auth in
  scope for this build)**.
- **Context:** The user reversed ADR-015: **auth back in the Phase 1+2 spec**, multi-user
  isolation as a day-one requirement. This restored ADR-012's "in scope" clause in full.
- **Decision:** Phase 1+2 ships **Better Auth from the first build** - `users` + auth tables,
  required `owner_id` FK, session-required user-scoped routes, `404` on cross-user access.
- **Consequences:** None shipped in between (reversed by ADR-017 before implementation, then
  re-adopted by ADR-019). The multi-user requirements (required `owner_id`, user-scoped queries)
  are now the live spec.

## ADR-017 · Auth deferred again - Phase 1+2 is single-user (reverses ADR-016)

- **Status:** Accepted 2026-08-03, then **superseded by ADR-019 (2026-08-03, user - auth restored)**.
  Kept as the historical record; do not follow.
- **Context:** The user had approved the Phase 1+2 spec with **auth deferred to the next spec**, keeping
  Drizzle + local Docker and the Cutting Room tokens. This reversed ADR-016 and re-adopted ADR-015's
  stance: Phase 1+2 validates the creative loop (idea → approved production plan) without accounts.
- **Decision:** Phase 1+2 ships **single-user, no auth** (ADR-015 restored). `projects.owner_id` is
  a **nullable, reserved, indexed** column so the auth spec later is a one-line backfill, not schema
  surgery. No users table, no session handling, no user-scoped queries in this build. Better Auth
  (ADR-012) stays the chosen provider for the auth spec.
- **Consequences:** None shipped - reversed by ADR-019 (2026-08-03, user) before implementation.
  ADR-013 (Drizzle) + ADR-011 (local Docker) unchanged.

## ADR-018 · Vertical slice skipped - Phase 1+2 is the first build

- **Status:** Accepted (user decision 2026-08-03)
- **Context:** The vertical slice (phase-1a) was planned as a 1–2 day validation build proving the
  idea → approved-script loop first. The user decided to **skip it**: build the full Phase 1+2 spec
  directly as the first build, absorbing the slice's foundation work (monorepo scaffold, shared
  schemas, provider abstraction, base agents, workflow) into the Phase 1+2 implementation plan.
- **Decision:** No slice build. The Phase 1+2 implementation plan scaffolds the monorepo from
  scratch, on **Postgres via Docker (ADR-004/011) + Drizzle (ADR-013)** - no SQLite anywhere
  (ADR-014 superseded). The slice's spec/plan stay in docs as design history, marked skipped.
- **Consequences:** The first shipped build is the full idea → approved production-plan flow; the
  monorepo scaffold + provider/agent foundation (previously slice tasks) are now the first tasks of
  the Phase 1+2 plan. Slightly larger first milestone, no throwaway code.

## ADR-019 · Auth restored - multi-user isolation from day one (reverses ADR-017)

- **Status:** Accepted 2026-08-03, then **superseded by ADR-021 (2026-08-04, user - auth deferred
  to the next spec)**, then **re-adopted in full by ADR-022 (2026-08-04, user - auth in scope for
  this build)**. ADR-023 (2026-08-04) **replaces the provider** (Better Auth → Clerk); the in-scope
  stance below stands, but read the provider parts as superseded.
- **Context:** The user wants **auth in the Phase 1+2 spec** - §12 and the data model include
  `users` from day one. This re-adopts ADR-019's stance (which itself reversed ADR-017).
- **Decision:** Phase 1+2 ships **Better Auth (ADR-012) from the first build**: `users`
  + Better Auth's `account`/`session` tables in the first migration; `projects.owner_id` is a
  **required FK → users.id**; all `/api/v1` routes require a session and scope by `owner_id`
  (cross-user → `404`, never `403`, to avoid leaking existence); sign-up/sign-in/sign-out +
  `get-session` routes; the UI has sign-in/sign-up pages and session-guarded workspace.
- **Consequences:** Multi-user correctness is enforced from the first schema; auth adds a dedicated
  implementation task (schema, handler, hook, routes, UI, isolation tests, E2E sign-in). ADR-021's
  deferral is superseded by ADR-022 (2026-08-04, user). Drizzle + local Docker (ADR-013/011)
  unchanged.

## ADR-020 · OpenArt as primary design reference - experience + interface (evolves ADR-010)

- **Status:** Proposed - in review (user directive 2026-08-04: "use OpenArt as a primary source of
  inspiration for both the product experience and the interface design"). Pending the user's
  approval of `docs/openart-design-direction.md`.
- **Context:** The Cutting Room token sheet is locked Final (ADR-010) and stays the visual
  foundation. The user now wants OpenArt (openart.ai/suite/home) as the primary reference for the
  **product experience and interface design**: its simplicity, guided workflows, progressive
  disclosure, shared asset library, remix/variation iteration, and continuity references - but
  deliberately **not a clone**. Research summary and the translation live in
  `docs/openart-design-direction.md`.
- **Decision:** The experience evolves to a **directed studio**: the AI is a crew of agents, the
  human is the director approving **takes**. Concretely: the two-column workspace becomes a
  **three-zone production console** (call-sheet rail / canvas / director's notes) with a persistent
  **Director Bar** (conversational instruction line) + contextual approve; the Coverage rail becomes
  **Director's Notes** (suggestions, scores, take log, asset tray); version rows become a **take
  log** (compare/rollback/variation); Cast & Locations become first-class **@reference** objects
  (ADR: Character/Environment agents); a per-project **Asset Library** (R2, ADR-007) is designed in;
  progressive disclosure keeps three depths (take / notes / console).
- **Scope of change:** this **supersedes the Cutting Room's information architecture, workspace
  layout, and navigation** (the prototype's two-column stage view), while **keeping its token
  sheet, type system, timecode/slate language, states, motion, and anti-slop guardrails**
  (ADR-010).
- **Consequences:** UI work after approval re-lays-out `apps/web` (Task 1 port) to the console
  structure and adds the Director Bar, take log, and asset tray - high component reuse because
  tokens and stage content are unchanged. Marked Proposed until the user approves
  `openart-design-direction.md`; ADR-010's prototype remains the visual source of truth for
  tokens/micro-interactions meanwhile.

## ADR-021 · Auth deferred to the next spec - Better Auth + Drizzle locked for when it lands

- **Status:** Accepted 2026-08-04, then **superseded by ADR-022 (2026-08-04, user - auth in scope
  for this build after all)**. Kept as the historical record; do not follow.
- **Context:** The auth decision has flipped several times (ADR-015 → 016 → 017 → 019 → 021). At
  this point the user had settled on deferring auth to the next spec, locking Better Auth + Drizzle
  in advance.
- **Decision:** (Historical) Phase 1+2 is **single-user, no auth** (re-adopts ADR-015/017's stance):
  no `users` table, no auth routes, no session handling, no user-scoped queries in this build.
  `projects.owner_id` is created as a **nullable, reserved, indexed** column so the auth spec later
  is a one-line backfill, not schema surgery. Better Auth (ADR-012) + Drizzle adapter (ADR-013)
  were locked for when auth lands.
- **Consequences:** None shipped - superseded by ADR-022 (2026-08-04, user) before implementation.
  ADR-022 re-adopts ADR-019's auth-in-scope stance in full.

## ADR-022 · Auth in scope after all - multi-user isolation ships in this build (reverses ADR-021)

- **Status:** Accepted (user decision 2026-08-04) - the **"in scope" clause stands**; the provider
  detail is **updated by ADR-023 (2026-08-04, user - Clerk)**.
- **Context:** The user reversed the ADR-021 deferral: auth is **in the Phase 1+2 spec**.
- **Decision:** Phase 1+2 ships **auth from the first build**: every `/api/v1` route requires an
  authenticated user and scopes by `owner_id` (cross-user → `404`, never `403`); the UI has a
  session-guarded workspace; auth tests cover `401` unauthenticated and `404` cross-user isolation.
  **Provider: Clerk (managed) per ADR-023.**
- **Consequences:** Multi-user isolation from day one. ADR-023 replaces the self-hosted Better Auth
  plan: no local auth tables (Clerk owns identity); `owner_id` is a plain Clerk user id.
  Supersedes ADR-021 and restores ADR-019/ADR-016's in-scope stance. Drizzle + local Docker
  (ADR-013/011) unchanged.

## ADR-023 · Clerk for authentication - managed provider (supersedes ADR-012)

- **Status:** Accepted (user decision 2026-08-04 - "include auth now but with Clerk instead").
- **Context:** The user chose a **managed auth provider** over self-hosted Better Auth: no session
  tables to run, hosted sign-in/sign-up UI, email/password + OAuth + MFA out of the box, and no
  auth code to maintain. Auth stays in scope (ADR-022); only the provider changes.
- **Decision:** **Clerk** is the auth provider for Phase 1+2 and beyond:
  - **Clerk owns identity.** No local `users`/`account`/`session` tables (ADR-012's implied schema
    is dropped). `projects.owner_id` stores Clerk's user id (`user_...`) as a **plain `text`
    column, NOT NULL, indexed** - no FK to a local users table.
  - **Web (Next.js):** `@clerk/nextjs` - `<ClerkProvider>`, `<SignedIn>/<SignedOut>`,
    `<UserButton>`, `useAuth()`/`auth()`; sign-in/sign-up pages are Clerk-hosted (or embedded
    `<SignIn />` components) - no bespoke auth forms.
  - **API (Fastify):** a `requireUser` hook verifies the Clerk session JWT
    (`clerkClient.verifyToken` / `@clerk/backend`) from the `Authorization: Bearer` header and
    attaches `req.userId`; every `/api/v1` route is session-required and owner-scoped
    (`getOwnedProject(userId, id)` → `404` on cross-user). No `/api/auth/*` routes.
  - **Env:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (+ `CLERK_API_KEY`/JWT key as
    needed); local dev works with Clerk's development instance.
  - **Testing:** token verification is abstracted behind an injectable verifier so integration
    tests use a fake token/user id; E2E uses Clerk's test mode (test tokens / test users).
- **Consequences:** Multi-user isolation with near-zero auth code; identity lives in Clerk's cloud
  (an external dependency - acceptable for this product). `owner_id` is a Clerk user id string.
  Supersedes ADR-012's provider choice; ADR-022's in-scope stance, ADR-013 (Drizzle), and
  ADR-011 (local-first) unchanged. Task 2 of the plan becomes a Clerk integration task.

## ADR-024 · Vertical slice revived - SQLite slice is the first build (reverses ADR-018)

- **Status:** Accepted (user decision 2026-08-04 - third explicit instruction to execute the
  vertical slice with SQLite; treated as a genuine decision change, not a mis-speak). Reverses
  ADR-018.
- **Context:** ADR-018 (2026-08-03) skipped the vertical slice and made the full Phase 1+2 build
  the first build, on Postgres via Docker + Drizzle. On 2026-08-04 the user explicitly re-locked
  the **vertical slice implementation plan (`docs/superpowers/plans/2026-08-03-vertical-slice.md`)
  with SQLite** and instructed execution of its Task 1. The slice runs with **zero containers**  - 
  `pnpm dev` and nothing else.
- **Decision:** The vertical slice is the **active first build** - the idea → brief → script →
  review loop proving the HITL workflow. Storage is **SQLite via better-sqlite3 (ADR-014
  re-adopted)** with the LangGraph checkpointer `SqliteSaver` on the same file. No Postgres, no
  Docker, no Redis, no Clerk in the slice. The monorepo scaffold, shared schemas, provider
  abstraction, and agent foundation already built for Phase 1+2 are **absorbed into the slice
  tasks** (no throwaway code); Phase 1+2 (Postgres/Drizzle/worker/Clerk, ADR-004/011/013/006/023)
  stays documented as the follow-on build.
- **Consequences:** `packages/db` re-conforms from Postgres/Drizzle to the slice's SQLite form at
  the slice's db task; `docker-compose.yml` stays as future-infra reference (unused by the
  slice); `apps/api`/`apps/worker` Postgres/Redis wiring is dormant until Phase 1+2. Commit
  history keeps ADR-018's rationale; code follows this ADR.

---

## ADR-025 · Product name: Slate

- **Status:** Accepted (user approval 2026-08-04).
- **Context:** The working title `videogen` was generic and read as an AI-factory placeholder. The
  design language is "The Cutting Room" (ADR-010) - slate/timecode stepper, slate-line scene
  cards, the clapperboard "set your slate" moment. `slate.studio` verified available via RDAP;
  `slate.video` and `tungsten.video` are registered.
- **Decision:** The product is named **Slate**. "videogen" is replaced across docs, package scopes
  (`@videogen/*` → `@slate/*`), the sqlite filename (`./data/slate.db`), docker-compose labels,
  and the prototype brand mark. The repo folder name on disk (`videogen/`) is the checkout
  directory, not the product - unchanged.
- **Consequences:** Code, docs, and prototypes now use `slate`/`Slate` consistently. The name is
  a single source of truth; no further name discussion in later specs.

---

## Open decisions (need your input)

1. ~~Auth provider~~ → **Decided: Clerk (managed auth, ADR-023) - in scope for Phase 1+2
   (ADR-022). Supersedes the Better Auth provider choice (ADR-012); auth ships in this build.**
2. ~~ORM~~ → **Decided (ADR-013): Drizzle.**
3. ~~Deployment target~~ → **Decided (ADR-011): local-first, deployable later.**
4. ~~Single-user vs multi-user~~ → **Decided: multi-user isolation from day one (ADR-022)  - 
   `projects.owner_id` = Clerk user id (`user_...`, text, NOT NULL, indexed); cross-user access
   returns `404`.**
5. ~~Product name~~ → **Decided (ADR-025): Slate.**
6. ~~Slice storage~~ → **Decided (ADR-014): SQLite via better-sqlite3 for the slice; Postgres for
   the full build.**
7. ~~Design direction sign-off~~ → **Decided (ADR-010): "The Cutting Room", locked Final 2026-08-03  - 
   full-system frontend prototype (`prototypes/cutting-room-full.html`) approved as-is as the
   visual source of truth.** → **Evolving (ADR-020, in review 2026-08-04): OpenArt-inspired
   experience/interface direction (`docs/openart-design-direction.md`) - tokens stay; workspace
   becomes a three-zone console + Director Bar. Awaiting approval.**
8. ~~NVIDIA API key availability~~ → **Confirmed: user has a build.nvidia.com key.**

## How decisions change

To change an accepted ADR: write a new ADR that supersedes it with rationale. The old ADR stays in
history. Code must match the latest non-superseded ADR.

## Working agreements (process rules, user-approved 2026-08-04)

- Work in phases → tasks → steps, one at a time. One recommended next step per decision point;
  await approval unless the task itself was already approved.
- **Skip already-done work:** an instruction pointing at a completed task moves past it to the
  next pending task - no re-runs, no circles.
- A new explicit user decision supersedes a locked ADR; record it as a new ADR before executing.
