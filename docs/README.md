# Project Documentation — AI Video Studio ("videogen")

> **Status: DRAFTING** — All docs in this folder are written for your review. Nothing is implemented
> until you approve. This README is the entry point and index for the whole suite.

This folder is the **single source of truth** for what we are building and how we are building it.
Whenever we need direction — during planning, implementation, or a disagreement about scope — we
fall back to these docs.

## How to use this folder

1. **Start here.** Read the index, then `vision.md` to anchor on *why* we're building this.
2. **Read the blueprints** in this order: `architecture.md` → `ai-pipeline.md` → `database-schema.md`
   → `api-design.md` → `ui-design.md`.
3. **Read the process docs** when needed: `development-roadmap.md`, `decisions.md`,
   `quality-gates.md`, `testing-strategy.md`, `project-setup.md`.
4. **Check the current spec** in `specs/` — that is the phase we are designing/building right now.
5. **When you approve a doc**, its status below changes from `Draft` to `Approved`. Once a phase is
   built and shipped, its status changes to `Implemented`.

## Doc map

| Doc | Purpose | Status |
| --- | --- | --- |
| [vision.md](./vision.md) | Mission, core principles, target user, success criteria | **Approved** |
| [architecture.md](./architecture.md) | System architecture, stack, data flow, monorepo layout | **Approved** |
| [ai-pipeline.md](./ai-pipeline.md) | The 9-stage AI workflow, agent design, LangGraph mechanics | Draft |
| [database-schema.md](./database-schema.md) | PostgreSQL schema: tables, relationships, enums | Draft |
| [api-design.md](./api-design.md) | REST API surface, streaming, error handling, jobs | Draft |
| [ui-design.md](./ui-design.md) | UX principles, stage-flow UI, **"The Cutting Room"** design language (locked Final; prototype `prototypes/cutting-room-full.html` approved as-is) | **Final — locked** |
| [openart-design-direction.md](./openart-design-direction.md) | OpenArt-inspired experience + interface evolution (ADR-020): directed-studio console, Director Bar, take log, asset tray — **in review** | Draft — in review |
| [development-roadmap.md](./development-roadmap.md) | Phases 1–6 with deliverables & success criteria | Draft |
| [decisions.md](./decisions.md) | Architecture Decision Records + open decisions | Draft |
| [quality-gates.md](./quality-gates.md) | Scoring rubrics, thresholds, regeneration rules | Draft |
| [testing-strategy.md](./testing-strategy.md) | Testing layers, fixtures, CI plan | Draft |
| [project-setup.md](./project-setup.md) | Dev environment, env vars, run commands | Draft |
| [glossary.md](./glossary.md) | Consistent vocabulary used across all docs | Draft |
| [specs/](./specs/README.md) | Spec workflow + per-phase design specs | Draft |
| [specs/phase-1a-vertical-slice-design.md](./specs/phase-1a-vertical-slice-design.md) | Vertical slice — idea → approved script (**skipped, ADR-018**; design history only) | **Approved** |
| [specs/phase-1-foundation-design.md](./specs/phase-1-foundation-design.md) | First build: Phase 1+2 — idea → editable production plan (auth in scope — Clerk, ADR-022/023; slice skipped, ADR-018) | **Approved** |

> **Note:** The originally requested "Kiwaski Design" was researched and found to be undefined; the
> user requested a mature, non-template direction instead. UI now follows **"The Cutting Room"**
> design language (see `ui-design.md`). Kiwaski specifics can still be folded in on request.

## Doc conventions

- **Statuses:** `Draft` → `In Review` → `Approved` → `Implemented`. Only the user (you) approves docs.
- **Dates:** use `YYYY-MM-DD`.
- **Decisions:** any durable technical decision is recorded in `decisions.md` (ADR format), not
  scattered across chat. Code must match approved decisions.
- **Terminology:** use terms from `glossary.md` exactly. If a term is missing, add it to the glossary
  before using it.
- **Cross-references:** docs link to each other; they don't duplicate each other's content.

## Current state

- **Workspace:** empty (no code exists yet — verified).
- **In progress:** documentation review by the user.
- **Next:** Phase 1 Foundation design spec approval → implementation plan → build.
