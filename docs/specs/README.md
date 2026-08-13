# Specs

> Status: **Draft** · Last updated: 2026-08-03

Each development phase gets its own design spec here. Specs are the **contract** for implementation:
code is judged against them, and changes to a spec after approval go through the user.

## Lifecycle

```
Draft ──► In Review ──► Approved ──► Implemented
  ▲            │
  └── revisions requested by user
```

1. **Draft** - written during brainstorming; open questions listed at the end.
2. **In Review** - user is reviewing; changes are expected.
3. **Approved** - user approves. From here, the implementation plan is written (`writing-plans`).
4. **Implemented** - phase shipped and demoed; spec stays as the historical record.

## Template

Each spec contains: Goal · Scope (in/out) · User stories · Architecture · Data model · API · UI ·
Error handling · Testing · Success criteria · Open questions.

## Specs

| Spec | Phase | Status |
| --- | --- | --- |
| [phase-1a-vertical-slice-design.md](./phase-1a-vertical-slice-design.md) | **1a - Vertical slice (built, ADR-024)** | **Implemented + verified (2026-08-05)** |
| [phase-1-foundation-design.md](./phase-1-foundation-design.md) | 1+2 - Foundation & Storyboarding (**next build**) | **Approved** |

**Build order:** the vertical slice was **revived as the first build (ADR-024, reversing ADR-018)**  - 
idea → approved script on SQLite, fully implemented and E2E-verified (Playwright, Task 10). The
Phase 1+2 spec is the **next build**, absorbing the slice's foundation (scaffold, providers, base
agents) into its implementation plan. **Auth is in scope (ADR-022/023)** - Clerk with multi-user
isolation from day one, required `owner_id` (text = Clerk user id); Postgres via Docker + Drizzle
(ADR-011/013).

**Design (locked Final 2026-08-03, ADR-010):** "The Cutting Room" - the full-system frontend
prototype (`prototypes/cutting-room-full.html`) is **approved as-is** and is the visual source of
truth; the Phase 1+2 plan's UI task ports it.
