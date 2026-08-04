# Testing Strategy

> Status: **Draft** · Last updated: 2026-08-03 · Companion: `development-roadmap.md` (Definition of Done).

## Principles

- **Tests are part of the build**, not a wrap-up task. Every phase's Definition of Done includes
  "typecheck + tests pass."
- **The AI layer is deterministic in tests.** Real providers are never called in CI. All agent and
  workflow tests use a `FakeProvider` with scripted, canned responses (see below).
- **The workflow engine is the crown jewel** — human-in-the-loop, interrupts, resume, and failure
  paths get the most coverage.

## Test layers

### 1. Unit (Vitest)

- **Providers:** request building, response parsing, error mapping, backoff/fallback logic — against
  mocked HTTP (`nock` or fetch mock). Test 429 handling, malformed JSON, JSON-mode retry.
- **Parsers:** Zod schema validation for every agent output; the two-step extract→validate→retry.
- **Agents:** given a state snapshot + FakeProvider script, assert the output object and the prompts
  it built (golden prompt snapshots — prompt changes are reviewed like code).
- **Pure utils:** timecode math, scoring aggregation, version diffing.

### 2. Integration (Vitest + Fastify `inject`)

- API routes against a **test Postgres** (Docker, migrated, seeded; truncated between tests).
- Auth middleware, idempotency keys, error shape, SSE event fan-out.
- DB query correctness (versions, stage status materialization).

### 3. Workflow (Vitest, LangGraph in-memory + Postgres checkpointer)

The critical suite. Covers:

- **Happy path:** idea → brief → research → script → scores → awaiting approval.
- **Reject loop:** `approve=false` + feedback routes back to the producing node; version counts grow.
- **Approve resume:** `Command(resume=...)` continues to the next stage.
- **Provider failure:** FakeProvider throws 429s → retries → fallback provider → visible stage failure.
- **Interrupt integrity:** graph state persists across "restart" (new process, same checkpointer);
  resume maps to the right thread.
- **Malformed agent output:** garbage JSON → retry once → typed failure, not a crash.

### 4. E2E (Playwright)

- User flows against the running stack with a **FakeProvider injected server-side** (test env flag).
- Phase 1+2 E2E: sign up → create project from idea → answer discovery questions → review brief →
  review research → script editor renders, scores show, user edits → approve → storyboard reorder/
  edit → approve → production plan renders; a second account cannot see/open the first account's
  project.
- The dev-server preview must render **without console or page errors** — a blank render or a console
  error is a defect regardless of how the code reads.

### 5. Golden-file (Phase 4+)

- FFmpeg render command templates asserted against fixtures; output files validated (duration,
  size, audio track present).

## Fixtures

- `packages/ai/test/fixtures/` — canned provider responses: a full happy-path brief, a research
  packet, a draft script, a low-scoring script, a garbage-JSON response, a 429 sequence.
- `FakeProvider` implements the same `Provider` interface (ADR-002) — which also proves the
  abstraction works: the whole suite runs against a fake.

## CI

- Every PR/change: `typecheck` + `lint` + unit + integration + workflow suites (Turborepo caches per
  package).
- E2E: on main / before phase sign-off.
- Coverage target: agents + workflow ≥ 80%; API ≥ 70%; UI = smoke + critical flows.

## Running tests (plan — finalized at scaffolding)

- `pnpm test` (unit+integration+workflow), `pnpm test:e2e` (Playwright), `pnpm typecheck`, `pnpm lint`.
