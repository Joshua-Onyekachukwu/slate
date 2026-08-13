# Architecture

> Status: **Approved** (2026-08-03, user) · Last updated: 2026-08-03 · Supersedes nothing yet.

## System context

```
┌──────────────┐
│    User      │
│  (Browser)   │
└──────┬───────┘
       │ HTTPS / SSE
┌──────▼─────────────────────────────────────────────────────────┐
│  Frontend - Next.js (App Router) + React + TypeScript          │
│  Tailwind CSS · shadcn/ui · Framer Motion · TanStack Query     │
│  React Hook Form · Zod · TipTap (script editor)                │
└──────┬─────────────────────────────────────────────────────────┘
       │ REST (Fastify) + SSE progress
┌──────▼─────────────────────────────────────────────────────────┐
│  Backend - Node.js + Fastify + TypeScript                      │
│  REST API · project/version CRUD (Clerk JWT, ADR-023)          │
│  SSE: agent progress + streaming text                          │
└──────┬───────────────┬───────────────────────────┬─────────────┘
       │               │                           │
┌──────▼──────────┐  ┌─▼────────────────────────┐ ┌▼──────────────┐
│ Workflow Engine │  │ Queue - BullMQ + Redis   │ │ Object Store  │
│ LangGraph.js    │  │ research · script ·      │ │ Cloudflare R2 │
│ agents + review │  │ storyboard · media ·     │ │ images ·      │
│ gates (HITL)    │  │ render · export          │ │ videos ·      │
└──────┬──────────┘  └─┬────────────────────────┘ │ voice · music │
       │               │                         │ exports ·     │
┌──────▼──────────────▼──────┐                    │ thumbnails    │
│  PostgreSQL (source of     │                    └───────────────┘
│  truth: projects, versions,│
│  jobs, state)              │
└──────┬─────────────────────┘
       │
┌──────▼───────────────────────────────────────────────┐
│  AI Providers (behind Provider interface, ADR-002)   │
│  Primary: NVIDIA Build (OpenAI-compatible, free dev) │
│  Fallback: OpenAI · Anthropic                        │
│  Future: Gemini · Together AI · Fireworks            │
└──────────────────────────────────────────────────────┘

  Workers: Node.js worker processes consuming BullMQ jobs.
  Video processing: FFmpeg (stitching, captions, transitions, audio mix, export).
```

## Components

| Component | Tech | Responsibility |
| --- | --- | --- |
| Web app | Next.js 14+ (App Router), React 18+, TS | UI, stage flow, editors, previews |
| API | Fastify + TS | REST, SSE, orchestration entry points; Clerk JWT verification via `requireUser` hook (ADR-023) |
| Workflow engine | LangGraph.js | Agent graph, state, checkpoints, review-gate interrupts |
| Agents | LangChain.js + provider SDKs | Planning, research, script, review, storyboard, prompts |
| Provider layer | Custom interface (ADR-002) | Uniform chat/structured-output/embedding access |
| Database | PostgreSQL | Structured source of truth (schema in `database-schema.md`) |
| Queue | BullMQ + Redis | Durable background jobs (long-running generation/render) |
| Object storage | Cloudflare R2 | Generated assets + exports |
| Video processing | FFmpeg | Scene stitching, captions, transitions, audio, export |

## Monorepo layout (recommended - see decisions.md ADR-001)

```
Slate/
├── apps/
│   ├── web/          # Next.js frontend
│   ├── api/          # Fastify server
│   └── worker/       # BullMQ consumers (jobs: research, script, media, render, export)
├── packages/
│   ├── ai/           # providers, agents, workflow graph (LangGraph)
│   ├── db/           # schema, migrations, queries
│   └── shared/       # shared types, zod schemas, utils, enums
├── docs/             # ← you are here
└── package.json      # pnpm workspace root
```

## Data flow - the core loop

1. **Frontend** sends the user's idea to `POST /api/projects` (creates project + conversation).
2. **API** creates a workflow run: inserts a `Jobs` row, enqueues `research`/`script` jobs, and
   notifies the LangGraph workflow engine with a `thread_id` tied to the project.
3. **Workflow engine** runs agents stage by stage. Between stages it **persists state and pauses at
   review gates** (LangGraph `interrupt`). It never blocks on an open HTTP connection while waiting
   for the user (see `ai-pipeline.md`).
4. **Frontend** polls / subscribes via SSE for stage status and streams text as it's generated.
5. **User** reviews each stage output; approval calls an API endpoint that **resumes the workflow**
   with the user's feedback (`Command(resume=...)`).
6. Later phases: workers generate assets → R2 → FFmpeg render → export → download URL.

## Key invariants

- **Postgres is the source of truth.** R2 holds bytes; Postgres holds metadata, state, and versions.
- **No long-lived HTTP connections during human review.** The graph persists and exits; an approval
  endpoint resumes it. Thread IDs (`thread_id`) are tracked per project so resume maps correctly.
- **Everything is versioned** where the vision requires it: scripts, storyboards, prompts, scenes.
- **All AI calls go through the provider interface.** No agent imports an SDK directly.

## Cross-cutting concerns

- **Error handling:** agents can fail (rate limits, timeouts, malformed output). Every failure
  surfaces in the stage UI as a retryable action; workflow state must survive partial progress.
- **Rate limits:** NVIDIA Build dev tier is ~40 RPM - strict exponential backoff + fallback providers
  required (see `ai-pipeline.md`).
- **Security:** Clerk session JWTs verified on every `/api/v1` route, owner-scoped queries, `404` on
  cross-user access (ADR-023); R2 presigned URLs for downloads (Phase 3+); no secrets in the client.
- **Observability:** structured logs per thread/job; quality-gate scores recorded for every run.

## Decisions (see decisions.md for ADRs)

Decided 2026-08-03: **vertical slice skipped - Phase
1+2 is the first build** (ADR-018), **Drizzle ORM** (ADR-013), **local-first deployment, deployable
later** (ADR-011), **"The Cutting Room" design** (locked Final 2026-08-03, ADR-010 - prototype `prototypes/cutting-room-full.html` approved as-is), **NVIDIA key available**. **Auth: in scope  - 
multi-user isolation from day one** (ADR-012/023; Clerk - managed provider; restores ADR-019). Remaining open:
product name.
