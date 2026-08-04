# Development Roadmap

> Status: **Draft** · Last updated: 2026-08-03 · Each phase = one design spec → implementation plan →
> build → review cycle. Nothing starts until its spec is approved by the user.

## Phase 1+2 — Foundation & Storyboarding (the first combined spec)

**Goal:** idea → **approved, editable production plan** (script, storyboard, ordered scenes, prompt packs).

Phases 1 and 2 are planned as **one spec** (`specs/phase-1-foundation-design.md`) per user decision
(2026-08-03). **Build order (locked 2026-08-03): the vertical slice is skipped (ADR-018) — Phase
1+2 is the first build**, absorbing the slice's foundation work (scaffold, providers, core agents,
workflow) directly on Postgres via Docker.

Decided scope additions (2026-08-03): **auth in scope — multi-user isolation from day one**
(ADR-022 restores ADR-019; **Clerk**, ADR-012/023), **Drizzle ORM** (ADR-013),
**local-first deployment** (ADR-011), **vertical slice skipped — Phase 1+2 is the first build**
(ADR-018).

## Phase 1+2 — First build (implementation plan: `superpowers/plans/2026-08-03-phase-1-2-production-plan.md`)

Idea → approved, editable production plan in one build: scaffold-from-scratch monorepo, Postgres 16
via Docker + Drizzle, Clerk with multi-user isolation (ADR-022/023), the agent crew (Planning
→ Research → Script → Reviewer → Storyboard → Editor → Prompt), LangGraph with
research/script/storyboard gates, Fastify API, "The Cutting Room" UI. No media generation (Phase 3).

## Phase 3 — Media Generation (Weeks 5–7)

**Goal:** Generate and approve scenes individually.

- Deliverables: image generation, video generation, voiceover, captions, scene previews, per-scene
  approval, asset storage (R2), BullMQ media jobs.
- **Success criteria:** users can generate, review, and approve scenes one at a time.

## Phase 4 — Rendering (Weeks 8–9)

**Goal:** Ship a complete downloadable video.

- Deliverables: FFmpeg pipeline (stitching, transitions, captions, audio mixing, intro/outro,
  optional watermark, compression), music/SFX placement, MP4 export, thumbnail, project package.
- **Success criteria:** users receive a complete downloadable video.

## Phase 5 — Intelligent Quality (Weeks 10–12)

**Goal:** Catch weak outputs before export.

- Deliverables: quality scoring for all artifacts, continuity checks, automatic scene repair,
  regeneration suggestions.
- **Success criteria:** the system identifies weak outputs before export and offers targeted fixes.

## Phase 6 — Advanced features (post-12)

- Persistent characters, reusable locations, brand kits, multi-language dubbing, collaborative
  editing, template library, long-form series, API access. Each is its own mini-project with its own
  spec.

## Cross-cutting workstreams (start in Phase 1, continue throughout)

| Workstream | Where |
| --- | --- |
| Provider abstraction + routing + fallback | `packages/ai` — Phase 1 |
| Shared types/zod/enums | `packages/shared` — Phase 1 |
| Testing harness + provider mocks | `testing-strategy.md` — Phase 1 |
| Observability (logs, scores, run history) | Phase 1 baseline, grows each phase |
| Design system ("The Cutting Room" tokens) | `ui-design.md` — before Phase 1 UI build |

## Definition of done (every phase)

1. Spec approved by user.
2. Implementation plan written and approved.
3. Code meets spec; typecheck + tests pass (see `testing-strategy.md`).
4. Dev-server preview renders without console/page errors (verified in the running preview).
5. User demo + sign-off on success criteria.

## Current status

- **Phase 1+2 (first combined spec):** in draft (`specs/phase-1-foundation-design.md`). Awaiting
  user approval, then implementation plan.
