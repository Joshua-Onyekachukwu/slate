# Project Setup

> Status: **Draft** · Last updated: 2026-08-03 · This is the **plan**; exact commands are finalized
> at scaffolding time (after this doc is approved). Dev machine: Windows (Git Bash), so commands are
> written POSIX-style.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 20+ | via nvm-windows or direct installer |
| pnpm | 9+ | `corepack enable` or `npm i -g pnpm` |
| Docker Desktop | latest | full build only - **not needed for the vertical slice** (see below) |
| PostgreSQL | 16 | Docker image - full build only, not the slice |
| Redis | 7 | Docker image - full build only, not the slice |
| FFmpeg | latest | Phase 4; Windows: `winget install ffmpeg` or `choco install ffmpeg` |

> **Vertical slice (ADR-014): zero containers.** The slice (`specs/phase-1a-vertical-slice-design.md`)
> runs on **SQLite via better-sqlite3** - no Docker, no Postgres, no Redis. Drizzle uses its SQLite
> dialect; the LangGraph checkpointer is `SqliteSaver` on the same file. Everything Docker-related
> below applies to the **full Phase 1+2 build** only.

## Repo layout (per ADR-001)

```
Slate/
├── apps/{web,api,worker}
├── packages/{ai,db,shared}
├── docs/
├── package.json           # pnpm workspace root
└── turbo.json
```

## Local infrastructure

- **Deployment decision (ADR-011): local-first, deployable later.** Everything below runs on your
  machine via Docker; a future move to Vercel + Neon + R2 is env config, not a rewrite.

- `docker-compose.yml` at repo root: `postgres:16` (port 5432) + `redis:7` (port 6379), named
  volumes, healthchecks. One command: `docker compose up -d`.
- Migrations run via Drizzle (`drizzle-kit`): `pnpm --filter db generate` then
  `pnpm --filter db migrate` (dev can use `push`).
- Dev flow: `docker compose up -d` → `pnpm --filter db migrate` → `pnpm dev`.
- **Auth is in scope (ADR-023):** Clerk is a managed provider - **no local auth tables and no CLI
  schema step**. Setup is: create a Clerk application, copy `CLERK_SECRET_KEY` +
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` into `.env`, and add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to
  the web's Next.js env; `owner_id` (text) stores Clerk user ids.

## Environment variables

| Var | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | api, worker, db | Postgres connection (LangGraph checkpointer uses it too) - **full build** |
| `DATABASE_PATH` | api, db | **Slice only (ADR-014):** sqlite file path, default `./data/slate.db` (LangGraph `SqliteSaver` checkpointer uses the same file) |
| `REDIS_URL` | worker, api | BullMQ broker |
| `NVIDIA_API_KEY` | ai | Primary provider (build.nvidia.com) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | ai | Fallback providers (optional in Phase 1) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | api, worker | Phase 3+ (object storage) |
| `CLERK_SECRET_KEY` | api, web | Clerk backend secret key - **Phase 1+2 (ADR-023)** |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | web | Clerk publishable key (client) - **Phase 1+2 (ADR-023)** |
| `NEXT_PUBLIC_API_URL` | web | API base URL for the browser |
| `FAKE_PROVIDER=1` | tests | Inject FakeProvider for E2E (never in prod) |

- `.env.example` committed with all keys documented; real `.env` files gitignored. No secrets in the
  client bundle (only `NEXT_PUBLIC_*`).

## Running the stack (plan)

```
pnpm install
docker compose up -d
pnpm --filter db migrate
pnpm dev            # turbo: web + api + worker in watch mode
pnpm test           # unit + integration + workflow
pnpm test:e2e       # Playwright (requires dev servers up)
```

## Provider API key (NVIDIA)

1. **Confirmed: the user already has a build.nvidia.com key** (2026-08-03).
2. Put it in `.env` as `NVIDIA_API_KEY`. Free dev tier ≈ 40 RPM (see ai-pipeline.md for backoff).

## Windows notes

- Git Bash: use `mv`/`rm`/`ls` (POSIX) - never cmd/PowerShell syntax.
- FFmpeg must be on `PATH` for render jobs; verify with `ffmpeg -version`.
- Docker Desktop must be running before `docker compose up`.
