# Phase 1+2 — Production Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **first** release of Slate: idea → **approved, editable production plan** (quality-scored script → ordered storyboard of scenes → per-scene prompt packs), running locally on Postgres via Docker, **multi-user with Clerk-managed auth isolation from day one (ADR-022/023)**, with "The Cutting Room" UI.

**Architecture:** Fresh pnpm+Turborepo monorepo (the vertical slice is **skipped**, ADR-018). `apps/web` (Next.js), `apps/api` (Fastify), `packages/shared` (zod/enums), `packages/db` (Drizzle + Postgres), `packages/ai` (LangGraph workflow + provider abstraction). Per project: a LangGraph graph runs discovery → brief → research → script → review → storyboard → editor → prompts, pausing at human-review gates (`interrupt()` + `Command(resume=...)`) for research, script, and storyboard; approvals persist via a Postgres checkpointer. All AI calls go through the `Provider` interface (ADR-002) — NVIDIA Build in prod, `FakeProvider` in tests.

**Tech Stack:** Next.js 14+ (App Router) + React 18 + TS strict · Fastify + TS · Drizzle ORM (`node-postgres`) · Postgres 16 via Docker · LangGraph.js (`@langchain/langgraph`) + `@langchain/langgraph-checkpoint-postgres` · Zod · Tailwind (token sheet only) · Vitest · Playwright.

## Global Constraints

- **Repo:** pnpm workspace `apps/*` + `packages/*`; Turborepo pipelines (ADR-001). Scaffolded from scratch in Task 1 — no prior codebase exists.
- **TypeScript:** `strict: true` everywhere; shared types/zod/enums live in `packages/shared` — no duplicated types.
- **DB:** **Postgres 16 via Docker** (ADR-004/011) + Drizzle ORM (ADR-013); tables: `projects`, `scripts`, `storyboards`, `scenes` — **no local auth tables (ADR-023)**. No SQLite anywhere (ADR-014 superseded by ADR-018).
- **Auth:** **Clerk in scope (ADR-022/023)** — multi-user from day one. Clerk owns identity; `projects.owner_id` stores Clerk's user id (`user_...`) as **`text NOT NULL`, indexed**; every `/api/v1` route requires a valid Clerk session JWT (verified in a `requireUser` hook) and scopes by `owner_id`; cross-user access → `404`.
- **AI:** every agent output is Zod-validated; all calls through `Provider` (ADR-002).
- **Workflow:** LangGraph.js, `thread_id` = project id; gates persist + exit; resume via `Command(resume=...)` (ADR-003). Gates: **research, script, storyboard** — each approve/reject-with-feedback.
- **Design:** only the approved token sheet (`ui-design.md`) — `--ink #141110`, `--surface #1E1A18`, `--paper #EDE6DA`, `--paper-dim #D9D0C0`, `--ash #8C8378`, `--line #2B2622`, `--rec #E04B3A`, `--tungsten #E2A85C`; Cabinet Grotesk / General Sans / IBM Plex Mono; radius 2px. **Prompt packs render behind an "Advanced" toggle** (§7); **drag-to-reorder** scenes (§7). **The full-system frontend prototype (`prototypes/cutting-room-full.html`) is approved as-is and is the visual source of truth — Task 11 ports it (spec §7, ADR-010).**
- **Agents:** Planning, Research, Script, Script Reviewer, Storyboard, Cinematography (folded into Storyboard output), Prompt, Character, Environment, and **Editor Agent** (per-scene transition + music cue fields only, written into each scene's content) — the full crew minus Voice Director (cut 2026-08-03, spec §12.7).
- **API conventions:** `/api/v1`, JSON, single error shape `{ error: { code, message, details } }` (api-design.md).
- **Tests:** FakeProvider for all agent/workflow tests; no real provider calls in CI.
- **Windows (Git Bash):** POSIX syntax; Docker Desktop must be running (Postgres).

---

## File Structure

```
Slate/  (fresh monorepo, created in Task 1)
├── docker-compose.yml              # postgres:16 (ADR-004/011)
├── .env.example                    # DATABASE_URL + CLERK_* + provider keys
├── apps/
│   ├── web/                        # Next.js App Router
│   │   └── app/
│   │       ├── layout.tsx          # <ClerkProvider> wrap
│   │       ├── sign-in/[[...sign-in]]/page.tsx  # Clerk hosted sign-in (or <SignIn />)
│   │       ├── sign-up/[[...sign-up]]/page.tsx  # Clerk hosted sign-up (or <SignUp />)
│   │       ├── page.tsx            # dashboard (session-guarded): idea input + project slate grid
│   │       ├── projects/[id]/page.tsx  # workspace (owner-guarded): stepper + storyboard + scenes + prompts
│   │       └── components/
│   │           ├── stage-stepper.tsx   # 6 stages: Idea→Brief→Research→Script→Storyboard→Production
│   │           ├── scene-card.tsx      # slate-line scene card (SC 01 · 4.2s · CUT), draggable
│   │           ├── scene-editor.tsx    # per-scene fields + Advanced-toggle prompt tabs
│   │           ├── production-plan.tsx # consolidated read-only view
│   │           └── prompts-panel.tsx   # prompt pack tabs, behind Advanced toggle
│   └── api/                        # Fastify
│       └── src/
│           ├── app.ts              # buildApp(deps): routes + requireUser preHandler
│           ├── auth.ts             # Clerk backend client + verifyToken (Task 2)
│           ├── events.ts           # in-process stage bus for SSE (Task 10)
│           ├── index.ts            # boot: migrations, checkpointer, listen
│           ├── provider.ts         # env-switched provider (NVIDIA / FakeProvider)
│           ├── workflow.ts         # deps: getProject/saveProject/saveScript/saveStoryboard
│           ├── hooks.ts            # requireUser hook + getOwnedProject gate (Task 2)
│           └── routes/
│               ├── projects.ts     # CRUD (owner-scoped) + messages + stage approve/regenerate + production-plan
│               ├── storyboard.ts   # GET storyboard, approve/regenerate
│               ├── scenes.ts       # PUT scene (new version), PUT order (atomic)
│               └── prompts.ts      # regenerate/edit per-scene prompt pack
├── packages/
│   ├── shared/src/
│   │   ├── enums.ts                # ProjectStage, StageStatus, ScriptStatus, CreatedBy, SceneStatus, StoryboardStatus, ProductionPlanStatus
│   │   └── schemas.ts              # Brief, ResearchPacket, ScriptContent, ReviewScores, SceneContent, PromptPack, Character, Location
│   ├── db/src/
│   │   ├── schema.ts               # projects, scripts, storyboards, scenes (Postgres dialect; owner_id text = Clerk user id)
│   │   ├── client.ts               # pg Pool + drizzle
│   │   ├── migrate.ts              # drizzle-kit migrator
│   │   └── drizzle.config.ts       # dialect: postgresql
│   └── ai/src/
│       ├── providers/              # types.ts, nvidia.ts, fake.ts
│       ├── agents/                 # planning.ts, research.ts, script.ts, reviewer.ts, consistency.ts, storyboard.ts, editor.ts, prompts.ts
│       └── workflow/               # state.ts, graph.ts, resume.ts
└── tests/e2e/
    ├── production-plan.spec.ts     # sign up → idea → approved production plan
    ├── auth.spec.ts                # sign-up + second-account isolation (404)
    └── playwright.config.ts
```

---

### Task 1: Monorepo scaffold + Docker Postgres

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.env.example`, `docker-compose.yml`

**Interfaces:**
- Produces: workspace with `apps/*` + `packages/*`; Postgres 16 on port 5432 via Docker Compose; `DATABASE_URL` env.

- [ ] **Step 1: Create workspace root files**

`package.json`:
```json
{
  "name": "slate",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "pnpm --filter e2e test"
  },
  "devDependencies": { "turbo": "^2.3.0" }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tests"
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": [] }
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.next/
.env
*.log
coverage/
playwright-report/
test-results/
data/
```

`.env.example`:
```
DATABASE_URL=postgres://slate:slate@localhost:5432/slate
NVIDIA_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_SIGN_IN_URL=/sign-in
CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_API_URL=http://localhost:4000
FAKE_PROVIDER=0
```

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    container_name: slate-pg
    environment:
      POSTGRES_USER: Slate
      POSTGRES_PASSWORD: Slate
      POSTGRES_DB: Slate
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U slate"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  pgdata:
```

- [ ] **Step 2: Verify the workspace + Postgres boot**

Run: `pnpm install && docker compose up -d`
Expected: install succeeds; `docker ps` shows `slate-pg` healthy.

- [ ] **Step 3: Commit**

```bash
git init && git add -A
git commit -m "chore: scaffold pnpm+turbo monorepo with docker postgres"
```

---

### Task 2: Clerk — managed auth, JWT verification, and the `requireUser` hook (ADR-022/023)

**Files:**
- Create: `apps/api/src/auth.ts` (Clerk backend client + injectable verifier), `apps/api/src/hooks.ts`, `apps/web/app/layout.tsx` (`<ClerkProvider>`), `apps/web/app/sign-in/[[...sign-in]]/page.tsx`, `apps/web/app/sign-up/[[...sign-up]]/page.tsx`, `apps/web/middleware.ts` (route protection)
- Test: `apps/api/src/auth.test.ts`
- **No local auth tables** (ADR-023) — Clerk owns identity; `owner_id` stores Clerk user ids.

**Interfaces:**
- Consumes: Postgres (Task 1), `packages/db` schema, Clerk dev instance keys.
- Produces: `verifyToken(token): Promise<{ userId }>` (Clerk JWT verification, injectable for tests); `requireUser` Fastify hook; `getOwnedProject(userId, id)` gate (→ `404` on cross-user); ClerkProvider + sign-in/sign-up routes + `middleware.ts` on the web.

- [ ] **Step 1: Write the failing auth test**

`apps/api/src/auth.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app";
import { FakeProvider } from "@slate/ai";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { runMigrations } from "@slate/db";

const TEST_URL = process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate";
// Fake verifier: maps a bearer token to a Clerk user id, so tests never call Clerk.
const fakeVerify = (map: Record<string, string>) => async (token: string) => {
  const userId = map[token];
  if (!userId) throw { statusCode: 401, code: "UNAUTHORIZED", message: "invalid token" };
  return { userId };
};

describe("auth", () => {
  let checkpointer: PostgresSaver;
  beforeAll(async () => { await runMigrations(); checkpointer = await PostgresSaver.fromConnString(TEST_URL); await checkpointer.setup(); });
  afterAll(async () => { await checkpointer.close(); });

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  it("creates an owned project and lists only mine", async () => {
    const app = buildApp({ provider: new FakeProvider([]), checkpointer, verifyToken: fakeVerify({ "tok-a": "user_a" }) });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" }, headers: bearer("tok-a") });
    expect(created.statusCode).toBe(200);
    const pid = created.json().project.id;
    const list = await app.inject({ method: "GET", url: "/api/v1/projects", headers: bearer("tok-a") });
    expect(list.json().projects).toHaveLength(1);
    expect(list.json().projects[0].id).toBe(pid);
    expect(list.json().projects[0].owner_id).toBe("user_a");
  });

  it("returns 401 without a valid token", async () => {
    const app = buildApp({ provider: new FakeProvider([]), checkpointer, verifyToken: fakeVerify({}) });
    const res = await app.inject({ method: "GET", url: "/api/v1/projects" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 when user B opens user A's project", async () => {
    const app = buildApp({ provider: new FakeProvider([]), checkpointer, verifyToken: fakeVerify({ "tok-a": "user_a", "tok-b": "user_b" }) });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" }, headers: bearer("tok-a") });
    const pid = created.json().project.id;
    const res = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}`, headers: bearer("tok-b") });
    expect(res.statusCode).toBe(404); // never 403 — avoids leaking existence
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — no auth module, routes 404, no `requireUser`.

- [ ] **Step 3: Implement Clerk verification + hooks**

`apps/api/src/auth.ts` — Clerk backend client with an injectable verifier (the fake replaces it in tests):
```ts
import { createClerkClient } from "@clerk/backend";

export type TokenVerifier = (token: string) => Promise<{ userId: string }>;

export function makeVerifyToken(secretKey = process.env.CLERK_SECRET_KEY): TokenVerifier {
  const clerk = createClerkClient({ secretKey });
  return async (token) => {
    const payload = await clerk.verifyToken(token); // verifies Clerk JWT
    return { userId: payload.sub }; // Clerk user id (user_...)
  };
}
```

`apps/api/src/hooks.ts` — the owner-scoping gate every route uses:
```ts
import type { FastifyRequest } from "fastify";
import { db, projects } from "@slate/db";
import { sql } from "drizzle-orm";
import type { TokenVerifier } from "./auth";

export function requireUser(verifyToken: TokenVerifier) {
  return async (req: FastifyRequest) => {
    const authz = req.headers.authorization ?? "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!token) throw { statusCode: 401, code: "UNAUTHORIZED", message: "sign in required" };
    const { userId } = await verifyToken(token);
    req.userId = userId;
  };
}

export async function getOwnedProject(userId: string, id: string) {
  const [row] = await db.select().from(projects).where(sql`id = ${id} AND owner_id = ${userId}`);
  if (!row) throw { statusCode: 404, code: "NOT_FOUND", message: "project not found" }; // owner-scoped 404
  return row;
}
```

`apps/api/src/app.ts` — wire the verifier + preHandler hook (no `/api/auth/*` routes — Clerk hosts auth):
```ts
app.addHook("preHandler", (req, _reply, done) => {
  if (req.url.startsWith("/api/v1")) { requireUser(deps.verifyToken)(req).then(() => done()).catch((e) => done(e)); }
  else done();
});
```

`apps/web/app/layout.tsx` — wrap the app in Clerk:
```tsx
import { ClerkProvider } from "@clerk/nextjs";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
```

`apps/web/middleware.ts` — protect routes (dashboard + workspace):
```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
const isProtected = createRouteMatcher(["/", "/projects(.*)"]);
export default clerkMiddleware((auth, req) => { if (isProtected(req)) auth().protect(); });
export const config = { matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"] };
```

`apps/web/app/sign-in/[[...sign-in]]/page.tsx` + `sign-up/[[...sign-up]]/page.tsx` — Clerk-hosted catch-all routes (or embed `<SignIn />` / `<SignUp />`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS — token/owned-project, 401 without token, 404 cross-user (all against the fake verifier).

- [ ] **Step 5: Commit**

```bash
git add apps/api apps/web
git commit -m "feat(auth): clerk jwt verification, requireUser hook, owner-scoped 404"
```

---

### Task 3: Shared types, enums, and zod schemas (`packages/shared`)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/enums.ts`, `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`

**Interfaces:**
- Produces: `ProjectStage`, `StageStatus`, `ScriptStatus`, `CreatedBy`, `SceneStatus`, `StoryboardStatus`, `ProductionPlanStatus`; `BriefSchema`, `ResearchPacketSchema`, `ScriptContentSchema`, `ReviewScoresSchema`, `SceneContentSchema`, `PromptPackSchema`, `CharacterSchema`, `LocationSchema` + inferred TS types. Re-exported from `@slate/shared`.

- [ ] **Step 1: Write the failing schema tests**

`packages/shared/src/schemas.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BriefSchema, ScriptContentSchema, SceneContentSchema, PromptPackSchema } from "./schemas";

describe("BriefSchema", () => {
  it("accepts a valid brief", () => {
    const brief = { topic: "History of the universe", audience: "general", platform: "youtube", style: "documentary", durationSeconds: 270, tone: "wonder", narration: "male", aspectRatio: "16:9" };
    expect(BriefSchema.safeParse(brief).success).toBe(true);
  });
  it("rejects a brief missing duration", () => {
    expect(BriefSchema.safeParse({ topic: "x", audience: "general" }).success).toBe(false);
  });
});

describe("ScriptContentSchema", () => {
  it("accepts a full script", () => {
    const script = { title: "T", hook: "H", introduction: "I", body: ["B"], conclusion: "C", cta: null };
    expect(ScriptContentSchema.safeParse(script).success).toBe(true);
  });
});

describe("SceneContentSchema", () => {
  it("accepts a full scene", () => {
    const scene = { title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" };
    expect(SceneContentSchema.safeParse(scene).success).toBe(true);
  });
});

describe("PromptPackSchema", () => {
  it("accepts a pack with all five prompts", () => {
    const pack = { imagePrompt: "i", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" };
    expect(PromptPackSchema.safeParse(pack).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter shared test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

`packages/shared/src/enums.ts`:
```ts
export const ProjectStage = {
  DISCOVERY: "discovery",
  BRIEF: "brief",
  RESEARCH: "research",
  SCRIPT: "script",
  STORYBOARD: "storyboard",
  DONE: "done",
} as const;
export type ProjectStage = (typeof ProjectStage)[keyof typeof ProjectStage];

export const StageStatus = { IDLE: "idle", RUNNING: "running", AWAITING_REVIEW: "awaiting_review", APPROVED: "approved", FAILED: "failed" } as const;
export type StageStatus = (typeof StageStatus)[keyof typeof StageStatus];

export const ScriptStatus = { DRAFT: "draft", APPROVED: "approved", REJECTED: "rejected" } as const;
export type ScriptStatus = (typeof ScriptStatus)[keyof typeof ScriptStatus];

export const CreatedBy = { AI: "ai", USER: "user" } as const;
export type CreatedBy = (typeof CreatedBy)[keyof typeof CreatedBy];

export const SceneStatus = { PENDING: "pending", APPROVED: "approved" } as const;
export type SceneStatus = (typeof SceneStatus)[keyof typeof SceneStatus];

export const StoryboardStatus = { DRAFT: "draft", APPROVED: "approved" } as const;
export type StoryboardStatus = (typeof StoryboardStatus)[keyof typeof StoryboardStatus];

export const ProductionPlanStatus = { DRAFT: "draft", READY: "ready" } as const;
export type ProductionPlanStatus = (typeof ProductionPlanStatus)[keyof typeof ProductionPlanStatus];
```

`packages/shared/src/schemas.ts`:
```ts
import { z } from "zod";

export const BriefSchema = z.object({
  topic: z.string().min(1),
  audience: z.string().min(1),
  platform: z.string().min(1),
  style: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  tone: z.string().min(1),
  narration: z.string().min(1),
  aspectRatio: z.string().min(1),
});
export type Brief = z.infer<typeof BriefSchema>;

export const ResearchPacketSchema = z.object({
  timeline: z.array(z.string()).default([]),
  concepts: z.array(z.string()).default([]),
  terminology: z.record(z.string()).default({}),
  references: z.array(z.string()).default([]),
  keyEvents: z.array(z.string()).default([]),
});
export type ResearchPacket = z.infer<typeof ResearchPacketSchema>;

export const ScriptContentSchema = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  introduction: z.string().min(1),
  body: z.array(z.string()).min(1),
  conclusion: z.string().min(1),
  cta: z.string().nullable().default(null),
});
export type ScriptContent = z.infer<typeof ScriptContentSchema>;

export const ReviewScoresSchema = z.object({
  clarity: z.number().min(1).max(5),
  pacing: z.number().min(1).max(5),
  engagement: z.number().min(1).max(5),
  retention: z.number().min(1).max(5),
  redundancy: z.number().min(1).max(5),
  notes: z.array(z.string()).default([]),
  overall: z.number().min(1).max(5),
});
export type ReviewScores = z.infer<typeof ReviewScoresSchema>;

export const SceneContentSchema = z.object({
  title: z.string().min(1),
  narration: z.string().min(1),
  visualDescription: z.string().min(1),
  cameraDirection: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  transition: z.string().min(1),
  musicCue: z.string().min(1),
});
export type SceneContent = z.infer<typeof SceneContentSchema>;

export const PromptPackSchema = z.object({
  imagePrompt: z.string().min(1),
  videoPrompt: z.string().min(1),
  narrationPrompt: z.string().min(1),
  musicPrompt: z.string().min(1),
  sfxPrompt: z.string().min(1),
});
export type PromptPack = z.infer<typeof PromptPackSchema>;

export const CharacterSchema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().min(1) });
export type Character = z.infer<typeof CharacterSchema>;

export const LocationSchema = z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().min(1) });
export type Location = z.infer<typeof LocationSchema>;

```

`packages/shared/src/index.ts`:
```ts
export * from "./enums";
export * from "./schemas";
```

`packages/shared/package.json`:
```json
{
  "name": "@slate/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "zod": "^3.24.0" },
  "devDependencies": { "typescript": "^5.7.0", "vitest": "^2.1.0" }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "strict": true, "skipLibCheck": true, "noEmit": true },
  "include": ["src"]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter shared test`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): enums and zod schemas for the full production-plan pipeline"
```

---

### Task 4: Drizzle Postgres schema + migrations (`packages/db`)

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/index.ts`, `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/migrate.ts`, `packages/db/drizzle.config.ts`
- Test: `packages/db/src/schema.test.ts`

**Interfaces:**
- Consumes: `@slate/shared` types.
- Produces: `db` (drizzle client), `pool` (pg), `runMigrations()`, tables `projects`, `scripts`, `storyboards`, `scenes`.

- [ ] **Step 1: Write the failing schema test**

`packages/db/src/schema.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { projects, scripts, storyboards, scenes } from "./schema";

const TEST_URL = process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate";

describe("db schema", () => {
  let pool: pg.Pool;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: TEST_URL });
    await pool.query(`DROP TABLE IF EXISTS scenes, storyboards, scripts, projects CASCADE`);
    await pool.query(`
      CREATE TABLE projects (
        id uuid PRIMARY KEY,
        owner_id text NOT NULL, -- Clerk user id (user_...) — no local users table (ADR-023)
        idea text NOT NULL,
        title text,
        stage text NOT NULL DEFAULT 'discovery',
        status text NOT NULL DEFAULT 'active',
        conversation jsonb NOT NULL DEFAULT '[]',
        brief jsonb,
        brief_history jsonb NOT NULL DEFAULT '[]',
        research_packet jsonb,
        research_status text NOT NULL DEFAULT 'pending',
        characters jsonb NOT NULL DEFAULT '[]',
        locations jsonb NOT NULL DEFAULT '[]',
        storyboard_version integer NOT NULL DEFAULT 0,
        production_plan_status text NOT NULL DEFAULT 'draft',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE scripts (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES projects(id),
        version integer NOT NULL,
        content jsonb NOT NULL,
        review_scores jsonb,
        review_notes text,
        created_by text NOT NULL DEFAULT 'ai',
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (project_id, version)
      );
      CREATE TABLE storyboards (
        id uuid PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES projects(id),
        version integer NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (project_id, version)
      );
      CREATE TABLE scenes (
        id uuid PRIMARY KEY,
        storyboard_id uuid NOT NULL REFERENCES storyboards(id),
        "order" integer NOT NULL,
        version integer NOT NULL,
        title text NOT NULL,
        content jsonb NOT NULL,
        prompt_pack jsonb,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (storyboard_id, "order", version)
      );
    `);
  });
  afterAll(async () => { await pool.end(); });

  it("round-trips a project owned by a Clerk user", async () => {
    const db = drizzle(pool);
    const uid = "user_abc123"; // Clerk user id (ADR-023)
    const row = { id: crypto.randomUUID(), ownerId: uid, idea: "doc about the universe" };
    await db.insert(projects).values(row);
    const got = await db.select().from(projects).where(sql`id = ${row.id}`);
    expect(got).toHaveLength(1);
    expect(got[0].owner_id).toBe(uid); // required (ADR-023)
    expect(got[0].stage).toBe("discovery");
  });

  it("rejects a project without an owner", async () => {
    const db = drizzle(pool);
    await expect(db.insert(projects).values({ id: crypto.randomUUID(), idea: "x" }))
      .rejects.toThrow(); // owner_id NOT NULL
  });

  it("inserts a storyboard and scenes with version rows", async () => {
    const db = drizzle(pool);
    const uid = "user_abc123"; // Clerk user id (ADR-023)
    const pid = crypto.randomUUID();
    await db.insert(projects).values({ id: pid, ownerId: uid, idea: "x" });
    const sbId = crypto.randomUUID();
    await db.insert(storyboards).values({ id: sbId, projectId: pid, version: 1 });
    await db.insert(scenes).values({
      id: crypto.randomUUID(), storyboardId: sbId, order: 1, version: 1,
      title: "The Bang", content: { title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" }, promptPack: null,
    });
    await db.insert(scenes).values({
      id: crypto.randomUUID(), storyboardId: sbId, order: 1, version: 2,
      title: "The Bang (v2)", content: { title: "The Bang (v2)", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" }, promptPack: null,
    });
    const rows = await db.select().from(scenes).where(sql`storyboard_id = ${sbId}`);
    expect(rows).toHaveLength(2); // both versions persist
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
  });
});
```
(Test creates tables inline for isolation; drizzle-kit migration verified in Step 4.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter db test`
Expected: FAIL — schema module missing.

- [ ] **Step 3: Write the Postgres schema**

`packages/db/src/schema.ts`:
```ts
import { pgTable, uuid, text, jsonb, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { Brief, ResearchPacket, ScriptContent, ReviewScores, SceneContent, PromptPack, Character, Location } from "@slate/shared";

// No local `users` table (ADR-023) — Clerk owns identity; `owner_id` stores Clerk's `user_...` id.
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull().index(), // Clerk user id (ADR-023)
  idea: text("idea").notNull(),
  title: text("title"),
  stage: text("stage").notNull().default("discovery"),
  status: text("status").notNull().default("active"),
  conversation: jsonb("conversation").notNull().$type<{ role: "user" | "assistant"; content: string; at: string }[]>().default([]),
  brief: jsonb("brief").$type<Brief>(),
  briefHistory: jsonb("brief_history").notNull().$type<unknown[]>().default([]),
  researchPacket: jsonb("research_packet").$type<ResearchPacket>(),
  researchStatus: text("research_status").notNull().default("pending"),
  characters: jsonb("characters").notNull().$type<Character[]>().default([]),
  locations: jsonb("locations").notNull().$type<Location[]>().default([]),
  storyboardVersion: integer("storyboard_version").notNull().default(0),
  productionPlanStatus: text("production_plan_status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scripts = pgTable("scripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  version: integer("version").notNull(),
  content: jsonb("content").notNull().$type<ScriptContent>(),
  reviewScores: jsonb("review_scores").$type<ReviewScores>(),
  reviewNotes: text("review_notes"),
  createdBy: text("created_by").notNull().default("ai"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("scripts_project_version").on(t.projectId, t.version)]);

export const storyboards = pgTable("storyboards", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  version: integer("version").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("storyboards_project_version").on(t.projectId, t.version)]);

export const scenes = pgTable("scenes", {
  id: uuid("id").primaryKey().defaultRandom(),
  storyboardId: uuid("storyboard_id").notNull().references(() => storyboards.id),
  order: integer("order").notNull(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  content: jsonb("content").notNull().$type<SceneContent>(),
  promptPack: jsonb("prompt_pack").$type<PromptPack>(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("scenes_storyboard_order_version").on(t.storyboardId, t.order, t.version)]);
```
(Scene edits and prompt regenerations create **new version rows** — spec §12.9. The latest version per `(storyboard_id, order)` is the current scene.)

`packages/db/src/client.ts`:
```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export { pool };
```

`packages/db/src/migrate.ts`:
```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./client";

export async function runMigrations() {
  await migrate(db, { migrationsFolder: "./drizzle" });
}
```

`packages/db/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate" },
});
```

`packages/db/src/index.ts`: `export * from "./schema"; export { db, pool } from "./client"; export { runMigrations } from "./migrate";`

`packages/db/package.json`:
```json
{
  "name": "@slate/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run", "generate": "drizzle-kit generate", "push": "drizzle-kit push", "migrate": "drizzle-kit migrate" },
  "dependencies": { "@slate/shared": "workspace:*", "drizzle-orm": "^0.38.0", "pg": "^8.13.0" },
  "devDependencies": { "@types/pg": "^8.11.0", "drizzle-kit": "^0.30.0", "typescript": "^5.7.0", "vitest": "^2.1.0" }
}
```

- [ ] **Step 4: Run test, generate + apply migration to Docker Postgres**

Run: `docker compose up -d && pnpm --filter db test`
Expected: PASS. Then: `pnpm --filter db generate && pnpm --filter db migrate`
Verify: `docker exec slate-pg psql -U slate -c '\dt'` lists `projects`, `scripts`, `storyboards`, `scenes` (+ drizzle journal). No local auth tables (ADR-023).

- [ ] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat(db): drizzle postgres schema for projects, scripts, storyboards, scenes"
```

---

### Task 5: Provider abstraction (`packages/ai` providers)

**Files:**
- Create: `packages/ai/package.json`, `packages/ai/tsconfig.json`, `packages/ai/src/index.ts`, `packages/ai/src/providers/types.ts`, `packages/ai/src/providers/nvidia.ts`, `packages/ai/src/providers/fake.ts`
- Test: `packages/ai/src/providers/types.test.ts`, `packages/ai/src/providers/nvidia.test.ts`

**Interfaces:**
- Consumes: `@slate/shared` schemas.
- Produces:
  - `interface Provider { name: string; complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }> }`
  - `type ChatMessage = { role: "system" | "user" | "assistant"; content: string }`
  - `class ProviderError extends Error` with codes `RATE_LIMITED | PROVIDER_FAILURE | INVALID_OUTPUT`
  - `class NvidiaProvider implements Provider` (OpenAI-compatible, backoff on 429, retry-once on Zod failure)
  - `class FakeProvider implements Provider` (scripted per-call responses; **stores last input** for feedback assertions)

- [ ] **Step 1: Write the failing tests**

`packages/ai/src/providers/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FakeProvider } from "./fake";
import { z } from "zod";

describe("FakeProvider", () => {
  it("returns the next scripted output and validates schema", async () => {
    const p = new FakeProvider([{ content: '{"topic":"universe"}' }]);
    const schema = z.object({ topic: z.string() });
    const res = await p.complete({ messages: [{ role: "user", content: "hi" }], schema });
    expect(res.output).toEqual({ topic: "universe" });
  });
  it("throws when the queue is exhausted", async () => {
    const p = new FakeProvider([]);
    await expect(p.complete({ messages: [{ role: "user", content: "hi" }], schema: z.object({}) })).rejects.toThrow(/no scripted response/i);
  });
  it("exposes the last input for feedback assertions", async () => {
    const p = new FakeProvider([{ content: '{"topic":"universe"}' }]);
    await p.complete({ messages: [{ role: "user", content: "add sources" }], schema: z.object({ topic: z.string() }) });
    expect(p.lastInput.messages[p.lastInput.messages.length - 1].content).toContain("add sources");
  });
});
```

`packages/ai/src/providers/nvidia.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { NvidiaProvider } from "./nvidia";
import { z } from "zod";

describe("NvidiaProvider", () => {
  afterEach(() => vi.restoreAllMocks());
  it("calls the OpenAI-compatible endpoint and returns parsed output", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"topic":"universe"}' } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const p = new NvidiaProvider({ apiKey: "k", model: "nvidia/llama-3.3-70b", baseUrl: "https://integrate.api.nvidia.com/v1" });
    const res = await p.complete({ messages: [{ role: "user", content: "make a brief" }], schema: z.object({ topic: z.string() }) });
    expect(res.output).toEqual({ topic: "universe" });
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
  });
  it("retries once on 429 then throws ProviderError(RATE_LIMITED)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) }).mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) }));
    const p = new NvidiaProvider({ apiKey: "k", model: "m", baseUrl: "http://x/v1" });
    await expect(p.complete({ messages: [], schema: z.object({}) })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter ai test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

`packages/ai/src/providers/types.ts`:
```ts
import type { ZodType } from "zod";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface Provider {
  readonly name: string;
  complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }>;
}

export type ProviderErrorCode = "RATE_LIMITED" | "PROVIDER_FAILURE" | "INVALID_OUTPUT";

export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, message: string) { super(message); this.name = "ProviderError"; }
}
```

`packages/ai/src/providers/fake.ts`:
```ts
import type { Provider, ChatMessage } from "./types";
import type { ZodType } from "zod";

export class FakeProvider implements Provider {
  readonly name = "fake";
  private queue: { content: string }[];
  private _lastInput: { messages: ChatMessage[]; schema: ZodType<unknown> } | null = null;
  constructor(scripted: { content: string }[]) { this.queue = [...scripted]; }
  get lastInput() { return this._lastInput!; }
  async complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }> {
    this._lastInput = input as { messages: ChatMessage[]; schema: ZodType<unknown> };
    const next = this.queue.shift();
    if (!next) throw new Error("FakeProvider: no scripted response for call " + input.messages[input.messages.length - 1]?.content);
    const parsed = input.schema.safeParse(JSON.parse(next.content));
    if (!parsed.success) throw new Error("FakeProvider: scripted content failed schema: " + parsed.error.message);
    return { output: parsed.data, raw: next.content, route: "fake" };
  }
}
```

`packages/ai/src/providers/nvidia.ts`:
```ts
import type { Provider, ChatMessage } from "./types";
import { ProviderError } from "./types";
import type { ZodType } from "zod";

type NvidiaConfig = { apiKey: string; model: string; baseUrl?: string; maxRetries?: number };

export class NvidiaProvider implements Provider {
  readonly name = "nvidia";
  private cfg: Required<Omit<NvidiaConfig, "maxRetries">> & { maxRetries: number };
  constructor(cfg: NvidiaConfig) { this.cfg = { baseUrl: "https://integrate.api.nvidia.com/v1", maxRetries: 2, ...cfg }; }

  async complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }> {
    const { apiKey, model, baseUrl, maxRetries } = this.cfg;
    const body = { model, messages: input.messages, temperature: 0.7, response_format: { type: "json_object" } };
    let attempt = 0;
    while (true) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
      } catch {
        if (attempt >= maxRetries) throw new ProviderError("PROVIDER_FAILURE", "network error");
        attempt++; continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) throw new ProviderError("RATE_LIMITED", `provider returned ${res.status}`);
        attempt++;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
        continue;
      }
      if (!res.ok) throw new ProviderError("PROVIDER_FAILURE", `provider returned ${res.status}`);
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content ?? "";
      const parsed = input.schema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        if (attempt >= maxRetries) throw new ProviderError("INVALID_OUTPUT", "output failed zod: " + parsed.error.message);
        attempt++; continue;
      }
      return { output: parsed.data, raw, route: `${model}@nvidia` };
    }
  }
}
```

`packages/ai/src/index.ts` (initial):
```ts
export * from "./providers/types";
export * from "./providers/nvidia";
export * from "./providers/fake";
```

`packages/ai/package.json`:
```json
{
  "name": "@slate/ai",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": {
    "@langchain/langgraph": "^0.2.0",
    "@langchain/langgraph-checkpoint-postgres": "^0.1.0",
    "@slate/shared": "workspace:*",
    "zod": "^3.24.0"
  },
  "devDependencies": { "typescript": "^5.7.0", "vitest": "^2.1.0" }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter ai test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai
git commit -m "feat(ai): provider interface with nvidia and fake implementations"
```

---

### Task 6: Core agents — planning, script, reviewer (`packages/ai` agents)

**Files:**
- Create: `packages/ai/src/agents/planning.ts`, `packages/ai/src/agents/script.ts`, `packages/ai/src/agents/reviewer.ts`
- Test: `packages/ai/src/agents/planning.test.ts`

**Interfaces:**
- Consumes: `Provider` (Task 5), `@slate/shared` schemas.
- Produces:
  - `planningAgent(provider, idea, conversation): Promise<{ kind: "questions"; questions: string[] } | { kind: "brief"; brief: Brief }>`
  - `scriptAgent(provider, brief, feedback?): Promise<ScriptContent>`
  - `reviewerAgent(provider, script): Promise<ReviewScores>`
  - `system(role: string): ChatMessage` (exported from `planning.ts`)

- [ ] **Step 1: Write the failing test**

`packages/ai/src/agents/planning.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planningAgent } from "./planning";
import { FakeProvider } from "../providers/fake";

describe("planningAgent", () => {
  it("asks questions first, then produces a brief", async () => {
    const p = new FakeProvider([
      { content: '{"kind":"questions","questions":["What platform?","How long?"]}' },
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
    ]);
    const first = await planningAgent(p, "doc about the universe", []);
    expect(first).toHaveProperty("questions");
    const second = await planningAgent(p, "doc about the universe", [{ role: "user", content: "youtube, 4:30" }]);
    expect(second).toHaveProperty("brief");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ai test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`packages/ai/src/agents/planning.ts`:
```ts
import { z } from "zod";
import type { Provider, ChatMessage } from "../providers/types";
import { BriefSchema } from "@slate/shared";

const PlanningOutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("questions"), questions: z.array(z.string()).min(1).max(4) }),
  z.object({ kind: z.literal("brief"), brief: BriefSchema }),
]);

export async function planningAgent(provider: Provider, idea: string, conversation: ChatMessage[]): Promise<
  { kind: "questions"; questions: string[] } | { kind: "brief"; brief: z.infer<typeof BriefSchema> }
> {
  const sys = "You are the Planning Agent of an AI video studio. Interview the user minimally. " +
    "Ask only questions you cannot infer. When you have enough, emit a brief. Reply strictly as JSON: " +
    '{"kind":"questions","questions":[...]} or {"kind":"brief","brief":{...}} matching: ' +
    "topic, audience, platform, style, durationSeconds (int), tone, narration, aspectRatio.";
  const res = await provider.complete({
    messages: [system(sys), ...conversation, { role: "user", content: `Idea: ${idea}` }],
    schema: PlanningOutputSchema,
  });
  return res.output;
}

export function system(role: string): ChatMessage { return { role: "system", content: role }; }
```

`packages/ai/src/agents/script.ts`:
```ts
import type { Provider } from "../providers/types";
import { ScriptContentSchema, type Brief } from "@slate/shared";
import { system } from "./planning";

export async function scriptAgent(provider: Provider, brief: Brief, feedback?: string) {
  const res = await provider.complete({
    messages: [
      system("You are the Script Agent. Write a video script: title, hook, introduction, body (array of paragraphs), conclusion, cta (nullable)."),
      { role: "user", content: `Brief: ${JSON.stringify(brief)}${feedback ? `\nRevision feedback: ${feedback}` : ""}` },
    ],
    schema: ScriptContentSchema,
  });
  return res.output;
}
```

`packages/ai/src/agents/reviewer.ts`:
```ts
import type { Provider } from "../providers/types";
import { ReviewScoresSchema, type ScriptContent } from "@slate/shared";
import { system } from "./planning";

export async function reviewerAgent(provider: Provider, script: ScriptContent) {
  const res = await provider.complete({
    messages: [
      system("You are the Script Reviewer. Score 1-5: clarity, pacing, engagement, retention, redundancy. Provide notes (array of strings) and overall."),
      { role: "user", content: `Script: ${JSON.stringify(script)}` },
    ],
    schema: ReviewScoresSchema,
  });
  return res.output;
}
```

Update `packages/ai/src/index.ts` — add:
```ts
export * from "./agents/planning";
export * from "./agents/script";
export * from "./agents/reviewer";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter ai test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents packages/ai/src/index.ts
git commit -m "feat(ai): planning, script, and reviewer agents"
```

---

### Task 7: Research + consistency agents (`packages/ai` agents)

**Files:**
- Create: `packages/ai/src/agents/research.ts`, `packages/ai/src/agents/consistency.ts`
- Modify: `packages/ai/src/index.ts` (exports)
- Test: `packages/ai/src/agents/research.test.ts`, `packages/ai/src/agents/consistency.test.ts`

**Interfaces:**
- Consumes: `Provider` (Task 5), shared schemas (Task 3).
- Produces:
  - `researchAgent(provider, brief, feedback?): Promise<ResearchPacket>`
  - `characterAgent(provider, brief, script): Promise<Character[]>`
  - `environmentAgent(provider, brief, script): Promise<Location[]>`

- [ ] **Step 1: Write the failing tests**

`packages/ai/src/agents/research.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { researchAgent } from "./research";
import { FakeProvider } from "../providers/fake";

describe("researchAgent", () => {
  it("returns a research packet from the brief", async () => {
    const p = new FakeProvider([
      { content: '{"timeline":["13.8 bya: Big Bang"],"concepts":["inflation"],"terminology":{},"references":["NASA"],"keyEvents":["first stars"]}' },
    ]);
    const brief = { topic: "universe", audience: "general", platform: "youtube", style: "documentary", durationSeconds: 270, tone: "wonder", narration: "male", aspectRatio: "16:9" };
    const packet = await researchAgent(p, brief);
    expect(packet.timeline[0]).toContain("Big Bang");
  });
  it("includes revision feedback in the provider input when provided", async () => {
    const p = new FakeProvider([
      { content: '{"timeline":["corrected"],"concepts":[],"terminology":{},"references":[],"keyEvents":[]}' },
    ]);
    const brief = { topic: "universe", audience: "general", platform: "youtube", style: "documentary", durationSeconds: 270, tone: "wonder", narration: "male", aspectRatio: "16:9" };
    await researchAgent(p, brief, "add sources");
    const lastUser = p.lastInput.messages[p.lastInput.messages.length - 1].content;
    expect(lastUser).toContain("add sources");
  });
});
```

`packages/ai/src/agents/consistency.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { characterAgent, environmentAgent } from "./consistency";
import { FakeProvider } from "../providers/fake";

describe("consistency agents", () => {
  const brief = { topic: "universe", audience: "general", platform: "youtube", style: "documentary", durationSeconds: 270, tone: "wonder", narration: "male", aspectRatio: "16:9" };
  const script = { title: "T", hook: "H", introduction: "I", body: ["B"], conclusion: "C", cta: null };

  it("extracts characters with stable ids", async () => {
    const p = new FakeProvider([
      { content: '[{"id":"char-1","name":"The Narrator","description":"A calm voice guiding the journey"}]' },
    ]);
    const chars = await characterAgent(p, brief, script);
    expect(chars[0].id).toBe("char-1");
  });
  it("extracts locations", async () => {
    const p = new FakeProvider([
      { content: '[{"id":"loc-1","name":"The Observable Universe","description":"Vast and dark"}]' },
    ]);
    const locs = await environmentAgent(p, brief, script);
    expect(locs[0].name).toContain("Universe");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter ai test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

`packages/ai/src/agents/research.ts`:
```ts
import type { Provider } from "../providers/types";
import { ResearchPacketSchema, type Brief } from "@slate/shared";
import { system } from "./planning";

export async function researchAgent(provider: Provider, brief: Brief, feedback?: string) {
  const res = await provider.complete({
    messages: [
      system("You are the Research Agent. Produce a factual research packet: timeline, concepts, terminology, references, keyEvents. Never invent; omit unverifiable claims."),
      { role: "user", content: `Brief: ${JSON.stringify(brief)}${feedback ? `\nRevision feedback: ${feedback}` : ""}` },
    ],
    schema: ResearchPacketSchema,
  });
  return res.output;
}
```

`packages/ai/src/agents/consistency.ts`:
```ts
import type { Provider } from "../providers/types";
import { CharacterSchema, LocationSchema, type Brief, type ScriptContent } from "@slate/shared";
import { system } from "./planning";

export async function characterAgent(provider: Provider, brief: Brief, script: ScriptContent) {
  const res = await provider.complete({
    messages: [
      system("You are the Character Agent. Extract stable characters from the script: id, name, description. Keep ids stable across revisions."),
      { role: "user", content: `Brief: ${JSON.stringify(brief)}\nScript: ${JSON.stringify(script)}` },
    ],
    schema: CharacterSchema.array(),
  });
  return res.output;
}

export async function environmentAgent(provider: Provider, brief: Brief, script: ScriptContent) {
  const res = await provider.complete({
    messages: [
      system("You are the Environment Agent. Extract stable locations from the script: id, name, description. Keep ids stable across revisions."),
      { role: "user", content: `Brief: ${JSON.stringify(brief)}\nScript: ${JSON.stringify(script)}` },
    ],
    schema: LocationSchema.array(),
  });
  return res.output;
}
```

Update `packages/ai/src/index.ts` — add:
```ts
export * from "./agents/research";
export * from "./agents/consistency";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter ai test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents packages/ai/src/index.ts
git commit -m "feat(ai): research and consistency (character/environment) agents"
```

---

### Task 8: Storyboard, editor, and prompt agents (`packages/ai` agents)

**Files:**
- Create: `packages/ai/src/agents/storyboard.ts`, `packages/ai/src/agents/editor.ts`, `packages/ai/src/agents/prompts.ts`
- Modify: `packages/ai/src/index.ts` (exports)
- Test: `packages/ai/src/agents/storyboard.test.ts`, `packages/ai/src/agents/editor.test.ts`, `packages/ai/src/agents/prompts.test.ts`

**Interfaces:**
- Consumes: `Provider`, shared schemas (Task 3).
- Produces:
  - `storyboardAgent(provider, script, characters, locations, feedback?): Promise<SceneContent[]>` (Cinematography folds into each scene's `cameraDirection` — spec §4)
  - `editorAgent(provider, scenes): Promise<SceneContent[]>` — fills each scene's per-scene `transition` + `musicCue` fields only (spec §4, §12.8)
  - `promptAgent(provider, scene, characters, locations): Promise<PromptPack>`

- [ ] **Step 1: Write the failing tests**

`packages/ai/src/agents/storyboard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { storyboardAgent } from "./storyboard";
import { FakeProvider } from "../providers/fake";

describe("storyboardAgent", () => {
  it("turns a script into ordered scenes", async () => {
    const p = new FakeProvider([
      { content: '[{"title":"The Bang","narration":"In the beginning…","visualDescription":"Light floods","cameraDirection":"Push-in","durationSeconds":8,"transition":"CUT","musicCue":"Drone"}]' },
    ]);
    const script = { title: "T", hook: "H", introduction: "I", body: ["B"], conclusion: "C", cta: null };
    const scenes = await storyboardAgent(p, script, [], []);
    expect(scenes[0].title).toBe("The Bang");
    expect(scenes[0].durationSeconds).toBe(8);
  });
});
```


`packages/ai/src/agents/editor.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { editorAgent } from "./editor";
import { FakeProvider } from "../providers/fake";

describe("editorAgent", () => {
  it("fills each scene's per-scene transition and music cue fields", async () => {
    const p = new FakeProvider([
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"DISSOLVE","musicCue":"strings swell"}]' },
    ]);
    const scenes = [{ title: "S1", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" }];
    const edited = await editorAgent(p, scenes);
    expect(edited[0].transition).toBe("DISSOLVE");
    expect(edited[0].musicCue).toBe("strings swell");
  });
});
```

`packages/ai/src/agents/prompts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { promptAgent } from "./prompts";
import { FakeProvider } from "../providers/fake";

describe("promptAgent", () => {
  it("generates a five-part prompt pack for a scene", async () => {
    const p = new FakeProvider([
      { content: '{"imagePrompt":"still","videoPrompt":"move","narrationPrompt":"voice","musicPrompt":"score","sfxPrompt":"boom"}' },
    ]);
    const scene = { title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" };
    const pack = await promptAgent(p, scene, [], []);
    expect(pack).toHaveProperty("imagePrompt");
    expect(pack).toHaveProperty("sfxPrompt");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter ai test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

`packages/ai/src/agents/storyboard.ts`:
```ts
import type { Provider } from "../providers/types";
import { SceneContentSchema, type ScriptContent, type Character, type Location } from "@slate/shared";
import { system } from "./planning";

export async function storyboardAgent(provider: Provider, script: ScriptContent, characters: Character[], locations: Location[], feedback?: string) {
  const res = await provider.complete({
    messages: [
      system("You are the Storyboard Agent. Convert the script into an ordered array of scenes. Each scene: title, narration, visualDescription, cameraDirection (cinematography), durationSeconds, transition, musicCue. Keep characters and locations consistent."),
      { role: "user", content: `Script: ${JSON.stringify(script)}\nCharacters: ${JSON.stringify(characters)}\nLocations: ${JSON.stringify(locations)}${feedback ? `\nRevision feedback: ${feedback}` : ""}` },
    ],
    schema: SceneContentSchema.array(),
  });
  return res.output;
}
```


`packages/ai/src/agents/editor.ts`:
```ts
import type { Provider } from "../providers/types";
import { SceneContentSchema, type SceneContent } from "@slate/shared";
import { system } from "./planning";

export async function editorAgent(provider: Provider, scenes: SceneContent[]) {
  const res = await provider.complete({
    messages: [
      system("You are the Editor Agent. For each scene, set the per-scene transition into the next shot and the music cue only — no cross-scene plan."),
      { role: "user", content: `Scenes: ${JSON.stringify(scenes)}` },
    ],
    schema: SceneContentSchema.array(),
  });
  return res.output;
}
```

`packages/ai/src/agents/prompts.ts`:
```ts
import type { Provider } from "../providers/types";
import { PromptPackSchema, type SceneContent, type Character, type Location } from "@slate/shared";
import { system } from "./planning";

export async function promptAgent(provider: Provider, scene: SceneContent, characters: Character[], locations: Location[]) {
  const res = await provider.complete({
    messages: [
      system("You are the Prompt Agent. For one scene, produce optimized prompts: imagePrompt, videoPrompt, narrationPrompt, musicPrompt, sfxPrompt. Optimize for the downstream generation models; keep character/location consistency; carry the brief's tone and narration direction into the narration prompt."),
      { role: "user", content: `Scene: ${JSON.stringify(scene)}\nCharacters: ${JSON.stringify(characters)}\nLocations: ${JSON.stringify(locations)}` },
    ],
    schema: PromptPackSchema,
  });
  return res.output;
}
```

Update `packages/ai/src/index.ts` — add:
```ts
export * from "./agents/storyboard";
export * from "./agents/editor";
export * from "./agents/prompts";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter ai test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents packages/ai/src/index.ts
git commit -m "feat(ai): storyboard, editor, and per-scene prompt agents"
```

---

### Task 9: LangGraph workflow — 3 gates to the production plan (`packages/ai` workflow)

**Files:**
- Create: `packages/ai/src/workflow/state.ts`, `packages/ai/src/workflow/graph.ts`, `packages/ai/src/workflow/resume.ts`
- Test: `packages/ai/src/workflow/graph.test.ts`

**Interfaces:**
- Consumes: agents (Tasks 6–8), `Provider` (Task 5), `db` (Task 4), shared types.
- Produces:
  - `type WorkflowState` (typed channels, below)
  - `buildWorkflow(provider, deps: WorkflowDeps, checkpointer?): CompiledGraph` — `checkpointer` required for interrupt persistence
  - `resumeWorkflow(graph, threadId, resume: { approved: boolean; feedback?: string } | string[]): Promise<Record<string, unknown>>` — returns the invoke result so callers read `__interrupt__`
  - Graph topology: `discovery → brief → research → research_gate [interrupt] → script → review → script_gate [interrupt] → consistency → storyboard → editor → prompt_gen → storyboard_gate [interrupt] → done` (Editor runs after the storyboard, feeding the prompt generator — spec §4)

- [ ] **Step 1: Write the failing workflow test**

`packages/ai/src/workflow/graph.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildWorkflow, type WorkflowDeps } from "./graph";
import { resumeWorkflow } from "./resume";
import { FakeProvider } from "../providers/fake";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const TEST_URL = process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate";

const fakeDeps = (): WorkflowDeps => ({
  getProject: async (id: string) => ({
    id, idea: "doc about the universe",
    conversation: [], stage: "discovery", status: "active", brief: null,
    researchPacket: null, researchStatus: "pending", characters: [], locations: [],
  }),
  saveProject: async (_id, patch) => { expect(patch).toBeDefined(); },
  saveScript: async (_projectId, content) => { expect(content).toBeDefined(); },
  saveStoryboard: async (_projectId, sb) => { expect(sb.scenes.length).toBeGreaterThan(0); expect(sb.promptPacks.length).toBeGreaterThan(0); },
});

describe("workflow to production plan", () => {
  let checkpointer: PostgresSaver;
  beforeAll(async () => {
    checkpointer = await PostgresSaver.fromConnString(TEST_URL);
    await checkpointer.setup();
  });
  afterAll(async () => { await checkpointer.close(); });

  it("runs idea→brief→research→script→storyboard→prompts, pausing at each gate", async () => {
    const p = new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"timeline":["13.8 bya"],"concepts":[],"terminology":{},"references":[],"keyEvents":[]}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
      { content: '[]' }, // characters
      { content: '[]' }, // locations
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"CUT","musicCue":"m"}]' },
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"DISSOLVE","musicCue":"strings swell"}]' }, // editor
      { content: '{"imagePrompt":"i","videoPrompt":"v","narrationPrompt":"n","musicPrompt":"m","sfxPrompt":"s"}' },
    ]);
    const graph = buildWorkflow(p, fakeDeps(), checkpointer);
    const threadId = "plan-happy";
    // 1st interrupt: research gate (consumes brief + research)
    const r1 = await graph.invoke({ projectId: threadId }, { configurable: { thread_id: threadId } });
    expect(r1.__interrupt__?.length ?? 0).toBeGreaterThan(0);
    // approve research → script + review → 2nd interrupt: script gate
    const r2 = await resumeWorkflow(graph, threadId, { approved: true });
    expect(r2.__interrupt__?.length ?? 0).toBeGreaterThan(0);
    // approve script → consistency + storyboard + editor + prompts → 3rd interrupt: storyboard gate
    const r3 = await resumeWorkflow(graph, threadId, { approved: true });
    expect(r3.__interrupt__?.length ?? 0).toBeGreaterThan(0);
    // approve storyboard → done
    await resumeWorkflow(graph, threadId, { approved: true });
    const state = await graph.getState({ configurable: { thread_id: threadId } });
    expect(state.values.stage).toBe("done");
    expect(state.values.productionPlanStatus).toBe("ready");
  });
});
```
(Add `import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ai test`
Expected: FAIL — `saveStoryboard` not in `WorkflowDeps`, state channels missing, graph edges unchanged.

- [ ] **Step 3: Extend state and graph**

`packages/ai/src/workflow/state.ts`:
```ts
import { Annotation } from "@langchain/langgraph";
import type { Brief, ResearchPacket, ScriptContent, ReviewScores, SceneContent, PromptPack, Character, Location } from "@slate/shared";

export const WorkflowState = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, b) => b }),
  stage: Annotation<string>({ reducer: (_, b) => b }),
  brief: Annotation<Brief | null>({ reducer: (_, b) => b, default: () => null }),
  researchPacket: Annotation<ResearchPacket | null>({ reducer: (_, b) => b, default: () => null }),
  researchStatus: Annotation<string>({ reducer: (_, b) => b, default: () => "pending" }),
  researchFeedback: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  script: Annotation<ScriptContent | null>({ reducer: (_, b) => b, default: () => null }),
  scores: Annotation<ReviewScores | null>({ reducer: (_, b) => b, default: () => null }),
  feedback: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
  characters: Annotation<Character[]>({ reducer: (_, b) => b, default: () => [] }),
  locations: Annotation<Location[]>({ reducer: (_, b) => b, default: () => [] }),
  storyboard: Annotation<SceneContent[] | null>({ reducer: (_, b) => b, default: () => null }),
  promptPacks: Annotation<PromptPack[]>({ reducer: (_, b) => b, default: () => [] }),
  storyboardVersion: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  productionPlanStatus: Annotation<string>({ reducer: (_, b) => b, default: () => "draft" }),
});
export type WorkflowState = typeof WorkflowState.State;
```

`packages/ai/src/workflow/graph.ts`:
```ts
import { StateGraph, START, END, interrupt, Command, type CompiledGraph } from "@langchain/langgraph";
import { WorkflowState } from "./state";
import { planningAgent, researchAgent, scriptAgent, reviewerAgent, characterAgent, environmentAgent, storyboardAgent, editorAgent, promptAgent } from "../agents";
import type { Provider } from "../providers/types";
import type { Brief, ResearchPacket, ScriptContent, SceneContent, Character, Location } from "@slate/shared";

export interface WorkflowDeps {
  getProject(id: string): Promise<{
    id: string; idea: string; conversation: unknown[]; stage: string; status: string;
    brief: unknown; researchPacket: unknown; researchStatus: string; characters: unknown[]; locations: unknown[];
  }>;
  saveProject(id: string, patch: Record<string, unknown>): Promise<void>;
  saveScript(projectId: string, content: ScriptContent): Promise<void>;
  saveStoryboard(projectId: string, sb: { version: number; scenes: SceneContent[]; promptPacks: unknown[] }): Promise<void>;
}

export function buildWorkflow(provider: Provider, deps: WorkflowDeps, checkpointer?: unknown): CompiledGraph<typeof WorkflowState.State> {
  const graph = new StateGraph(WorkflowState);

  graph.addNode("discovery", async (state) => {
    const project = await deps.getProject(state.projectId);
    const result = await planningAgent(provider, project.idea, project.conversation as never);
    if (result.kind === "questions") {
      const answers = interrupt<string[]>("discovery_questions");
      await deps.saveProject(state.projectId, {
        conversation: [...project.conversation,
          { role: "assistant", content: result.questions.join("\n"), at: new Date().toISOString() },
          { role: "user", content: answers.join("\n"), at: new Date().toISOString() },
        ],
      });
      return { stage: "discovery" };
    }
    await deps.saveProject(state.projectId, { brief: result.brief, stage: "brief" });
    return { stage: "brief", brief: result.brief };
  });

  graph.addNode("research", async (state) => {
    const packet = await researchAgent(provider, state.brief as Brief, state.researchFeedback);
    await deps.saveProject(state.projectId, { researchPacket: packet, researchStatus: "draft", stage: "research" });
    return { stage: "research", researchPacket: packet, researchStatus: "draft", researchFeedback: undefined };
  });

  graph.addNode("research_gate", async (state) => {
    const decision = interrupt<{ approved: boolean; feedback?: string }>("research_review");
    if (!decision?.approved) {
      await deps.saveProject(state.projectId, { researchStatus: "rejected" });
      return { researchStatus: "rejected", researchFeedback: decision?.feedback ?? "revise research" };
    }
    await deps.saveProject(state.projectId, { researchStatus: "approved" });
    return { researchStatus: "approved" };
  });

  graph.addNode("script", async (state) => {
    const content = await scriptAgent(provider, state.brief as Brief, state.feedback);
    await deps.saveScript(state.projectId, content);
    return { stage: "script", script: content, feedback: undefined };
  });

  graph.addNode("review", async (state) => {
    const scores = await reviewerAgent(provider, state.script as ScriptContent);
    return { stage: "script_review", scores };
  });

  graph.addNode("script_gate", async (state) => {
    const decision = interrupt<{ approved: boolean; feedback?: string }>("script_review");
    if (!decision?.approved) {
      return { feedback: decision?.feedback ?? "revise", stage: "script" };
    }
    return { stage: "storyboard" };
  });

  graph.addNode("consistency", async (state) => {
    const brief = state.brief as Brief;
    const script = state.script as ScriptContent;
    const characters = await characterAgent(provider, brief, script);
    const locations = await environmentAgent(provider, brief, script);
    await deps.saveProject(state.projectId, { characters, locations });
    return { characters, locations };
  });

  graph.addNode("storyboard", async (state) => {
    const scenes = await storyboardAgent(provider, state.script as ScriptContent, state.characters, state.locations, state.feedback);
    const version = (state.storyboardVersion ?? 0) + 1;
    return { storyboard: scenes, storyboardVersion: version, stage: "storyboard" };
  });

  graph.addNode("editor", async (state) => {
    const scenes = await editorAgent(provider, state.storyboard as SceneContent[]);
    return { storyboard: scenes }; // refined scenes flow to prompt_gen, which persists via saveStoryboard
  });

  graph.addNode("prompt_gen", async (state) => {
    const scenes = state.storyboard as SceneContent[];
    const packs: unknown[] = [];
    for (const scene of scenes) {
      packs.push(await promptAgent(provider, scene, state.characters, state.locations));
    }
    await deps.saveStoryboard(state.projectId, { version: state.storyboardVersion, scenes, promptPacks: packs });
    return { promptPacks: packs, productionPlanStatus: "draft" };
  });

  graph.addNode("storyboard_gate", async (state) => {
    const decision = interrupt<{ approved: boolean; feedback?: string }>("storyboard_review");
    if (!decision?.approved) {
      await deps.saveProject(state.projectId, { productionPlanStatus: "draft" });
      return { feedback: decision?.feedback ?? "revise storyboard", stage: "storyboard" };
    }
    await deps.saveProject(state.projectId, { productionPlanStatus: "ready", stage: "done" });
    return { productionPlanStatus: "ready", stage: "done" };
  });

  graph.addEdge(START, "discovery");
  graph.addConditionalEdges("discovery", (s) => (s.brief ? "research" : "discovery"));
  graph.addEdge("research", "research_gate");
  graph.addConditionalEdges("research_gate", (s) => (s.researchStatus === "approved" ? "script" : "research"));
  graph.addEdge("script", "review");
  graph.addEdge("review", "script_gate");
  graph.addConditionalEdges("script_gate", (s) => (s.stage === "storyboard" ? "consistency" : "script"));
  graph.addEdge("consistency", "storyboard");
  graph.addEdge("storyboard", "editor");
  graph.addEdge("editor", "prompt_gen");
  graph.addEdge("prompt_gen", "storyboard_gate");
  graph.addConditionalEdges("storyboard_gate", (s) => (s.stage === "done" ? END : "storyboard"));

  return graph.compile({ checkpointer });
}
```

`packages/ai/src/workflow/resume.ts`:
```ts
import { Command, type CompiledGraph } from "@langchain/langgraph";
import type { WorkflowState } from "./state";

export async function resumeWorkflow(
  graph: CompiledGraph<typeof WorkflowState.State>,
  threadId: string,
  resume: { approved: boolean; feedback?: string } | string[]
): Promise<Record<string, unknown>> {
  return (await graph.invoke(new Command({ resume }), { configurable: { thread_id: threadId } })) as Record<string, unknown>;
}
```

Update `packages/ai/src/index.ts` — add:
```ts
export * from "./workflow/state";
export * from "./workflow/graph";
export * from "./workflow/resume";
```

**interrupt wiring note:** `interrupt()` inside the gate nodes pauses the graph and persists state via the checkpointer; `resumeWorkflow` resumes with `Command(resume=...)`. The discovery interview pauses with `interrupt<string[]>` (answers), each gate with `interrupt<{ approved, feedback? }>`. The returned `__interrupt__` array indicates a pending pause — the API and UI use it to know when to show the approval bar.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter ai test`
Expected: PASS (happy path reaches `done`).

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/workflow packages/ai/src/index.ts
git commit -m "feat(ai): workflow with research, script, and storyboard gates to production plan"
```

---

### Task 10: Fastify API — auth, projects, stages, storyboard, scenes, prompts, production plan (`apps/api`)

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/provider.ts`, `apps/api/src/workflow.ts`, `apps/api/src/events.ts`, `apps/api/src/routes/projects.ts`, `apps/api/src/routes/storyboard.ts`, `apps/api/src/routes/scenes.ts`, `apps/api/src/routes/prompts.ts`, `apps/api/src/routes/stream.ts`
- Test: `apps/api/src/app.test.ts`

**Interfaces:**
- Consumes: `@slate/shared`, `@slate/db`, `@slate/ai` (workflow + agents), `resumeWorkflow`.
- Produces routes:
  - `POST /api/v1/projects` — create from an idea → kicks off the workflow (thread_id = project id)
  - `GET /api/v1/projects` — list
  - `GET /api/v1/projects/:id` — project + stage statuses
  - `POST /api/v1/projects/:id/messages` — answer discovery questions → resume with string[]
  - `POST /api/v1/projects/:id/stages/research/approve` → resume `{ approved, feedback? }`
  - `POST /api/v1/projects/:id/stages/research/regenerate` → resume reject (retry)
  - `POST /api/v1/projects/:id/stages/script/approve` + `regenerate`
  - `POST /api/v1/projects/:id/stages/storyboard/approve` + `regenerate`
  - `GET /api/v1/projects/:id/storyboard` → `{ storyboard: { version, status, scenes } }`
  - `PUT /api/v1/projects/:id/scenes/:sceneId` → `{ content, title }` → new version row
  - `PUT /api/v1/projects/:id/storyboard/order` → `{ scene_ids }` → atomic reorder
  - `POST /api/v1/projects/:id/scenes/:sceneId/prompts/regenerate` → new scene version
  - `PUT /api/v1/projects/:id/scenes/:sceneId/prompts` → `{ promptPack }` → new scene version
  - `GET /api/v1/projects/:id/production-plan` → consolidated view
  - `GET /api/v1/projects/:id/stream` → SSE stage progress (spec §2, api-design.md §SSE; owner-scoped)
  - **All `/api/v1` routes are session-required (Task 2 `requireUser`) and owner-scoped via
    `getOwnedProject(userId, id)` — cross-user access returns `404` (ADR-023).**

- [ ] **Step 1: Write the failing integration tests**

`apps/api/src/app.test.ts` (Postgres setup per Task 4; the FakeProvider scripted queue covers brief→research→script→review→characters→locations→storyboard→editor→prompts = 10 calls):
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app";
import { FakeProvider } from "@slate/ai";
import { runMigrations } from "@slate/db";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const TEST_URL = process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate";
let _tokSeq = 0;
// Clerk-style auth (Task 2): buildApp takes an injectable verifyToken; tests never call Clerk.
const fakeVerify = (map: Record<string, string>) => async (token: string) => {
  const userId = map[token];
  if (!userId) throw { statusCode: 401, code: "UNAUTHORIZED", message: "invalid token" };
  return { userId };
};
const bearer = (userId: string) => ({ authorization: `Bearer tok-${userId}` });
async function signInAs(app: any, userId: string) {
  return { headers: bearer(userId), userId }; // pass as `headers` in every inject
}
let checkpointer: PostgresSaver;
beforeAll(async () => {
  await runMigrations();
  checkpointer = await PostgresSaver.fromConnString(TEST_URL);
  await checkpointer.setup();
});
afterAll(async () => { await checkpointer.close(); });

const scriptedHappyPath = [
  { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
  { content: '{"timeline":["13.8 bya"],"concepts":[],"terminology":{},"references":[],"keyEvents":[]}' },
  { content: '{"title":"T","hook":"H","introduction":"I","body":["B"],"conclusion":"C","cta":null}' },
  { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
  { content: '[]' },
  { content: '[]' },
  { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"CUT","musicCue":"m"},{"title":"S2","narration":"n2","visualDescription":"v2","cameraDirection":"c2","durationSeconds":6,"transition":"DISSOLVE","musicCue":"m2"}]' },
  { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"DISSOLVE","musicCue":"strings swell"},{"title":"S2","narration":"n2","visualDescription":"v2","cameraDirection":"c2","durationSeconds":6,"transition":"CUT","musicCue":"m2"}]' },
  { content: '{"imagePrompt":"i1","videoPrompt":"v1","narrationPrompt":"n1","musicPrompt":"m1","sfxPrompt":"s1"}' },
  { content: '{"imagePrompt":"i2","videoPrompt":"v2","narrationPrompt":"n2","musicPrompt":"m2","sfxPrompt":"s2"}' },
];
// Queue: brief, research, script, review, characters, locations, storyboard (2 scenes), editor, prompt×2 = 10 calls.

describe("production plan API", () => {
  it("runs a project through all three gates to a ready production plan", async () => {
    const app = buildApp({ provider: new FakeProvider([...scriptedHappyPath]), checkpointer, verifyToken: fakeVerify({ "tok-user_a": "user_a", "tok-user_b": "user_b" }) });
    const { headers } = await signInAs(app, "user_a");
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" }, headers });
    expect(created.statusCode).toBe(200);
    const pid = created.json().project.id;
    await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/research/approve`, payload: { approved: true }, headers });
    await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/script/approve`, payload: { approved: true }, headers });
    const sb = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}/storyboard`, headers });
    expect(sb.statusCode).toBe(200);
    expect(sb.json().storyboard.scenes).toHaveLength(2);

    const reorder = await app.inject({
      method: "PUT", url: `/api/v1/projects/${pid}/storyboard/order`,
      payload: { scene_ids: [sb.json().storyboard.scenes[1].id, sb.json().storyboard.scenes[0].id] },
      headers,
    });
    expect(reorder.statusCode).toBe(200);
    const after = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}/storyboard`, headers });
    expect(after.json().storyboard.scenes[0].title).toBe("S2");

    const approve = await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/storyboard/approve`, payload: { approved: true }, headers });
    expect(approve.statusCode).toBe(200);
    const plan = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}/production-plan`, headers });
    expect(plan.json().plan.stage).toBe("done");
    expect(plan.json().plan.scenes.length).toBe(2);
  });

  it("edits a scene and creates a new version row", async () => {
    const app = buildApp({ provider: new FakeProvider([...scriptedHappyPath]), checkpointer, verifyToken: fakeVerify({ "tok-user_a": "user_a", "tok-user_b": "user_b" }) });
    const { headers } = await signInAs(app, "user_a");
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" }, headers });
    const pid = created.json().project.id;
    await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/research/approve`, payload: { approved: true }, headers });
    await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/script/approve`, payload: { approved: true }, headers });
    const sb = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}/storyboard`, headers });
    const sceneId = sb.json().storyboard.scenes[0].id;

    const edit = await app.inject({
      method: "PUT", url: `/api/v1/projects/${pid}/scenes/${sceneId}`,
      payload: { title: "S1 v2", content: { ...sb.json().storyboard.scenes[0].content, title: "S1 v2" } },
      headers,
    });
    expect(edit.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}/storyboard`, headers });
    expect(after.json().storyboard.scenes[0].title).toBe("S1 v2"); // latest version wins
  });

  it("rejects storyboard with feedback and regenerates", async () => {
    const withRegen = [...scriptedHappyPath,
      { content: '[{"title":"S1-short","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":4,"transition":"CUT","musicCue":"m"}]' },
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"DISSOLVE","musicCue":"strings swell"}]' }, // editor — per-scene fields only (spec §12.8)
      { content: '{"imagePrompt":"i","videoPrompt":"v","narrationPrompt":"n","musicPrompt":"m","sfxPrompt":"s"}' },
    ];
    const app = buildApp({ provider: new FakeProvider(withRegen), checkpointer, verifyToken: fakeVerify({ "tok-user_a": "user_a", "tok-user_b": "user_b" }) });
    const { headers } = await signInAs(app, "user_a");
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" }, headers });
    const pid = created.json().project.id;
    await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/research/approve`, payload: { approved: true }, headers });
    await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/script/approve`, payload: { approved: true }, headers });
    const reject = await app.inject({
      method: "POST", url: `/api/v1/projects/${pid}/stages/storyboard/approve`,
      payload: { approved: false, feedback: "scenes too long" },
      headers,
    });
    expect(reject.statusCode).toBe(200);
    const sb = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}/storyboard`, headers });
    expect(sb.json().storyboard.scenes[0].title).toBe("S1-short"); // regenerated
  });

  it("returns 409 when approving a stage with no pending interrupt", async () => {
    const app = buildApp({ provider: new FakeProvider([...scriptedHappyPath]), checkpointer, verifyToken: fakeVerify({ "tok-user_a": "user_a", "tok-user_b": "user_b" }) });
    const { headers } = await signInAs(app, "user_a");
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" }, headers });
    const pid = created.json().project.id;
    await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/research/approve`, payload: { approved: true }, headers });
    const dup = await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/research/approve`, payload: { approved: true }, headers });
    expect(dup.statusCode).toBe(409);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter api test`
Expected: FAIL — app module missing, routes 404.

- [ ] **Step 3: Write the app, provider, workflow deps, and routes**

`apps/api/src/provider.ts`:
```ts
import { NvidiaProvider, FakeProvider, type Provider } from "@slate/ai";

export function createProvider(): Provider {
  if (process.env.FAKE_PROVIDER === "1") return new FakeProvider([]); // scripted queue injected per-test / E2E override
  const key = process.env.NVIDIA_API_KEY;
  if (!key) throw new Error("NVIDIA_API_KEY is required unless FAKE_PROVIDER=1");
  return new NvidiaProvider({ apiKey: key, model: process.env.NVIDIA_MODEL ?? "nvidia/llama-3.3-70b" });
}
```

`apps/api/src/workflow.ts` — API-side deps backed by the DB:
```ts
import { randomUUID } from "node:crypto";
import { db, projects, scripts, storyboards, scenes } from "@slate/db";
import type { WorkflowDeps } from "@slate/ai";
import type { ScriptContent } from "@slate/shared";

export const workflowDeps: WorkflowDeps = {
  getProject: async (id) => {
    const [row] = await db.select().from(projects).where(sql`id = ${id}`);
    if (!row) throw new Error("project not found");
    return {
      id: row.id, idea: row.idea, conversation: row.conversation as unknown[],
      stage: row.stage, status: row.status, brief: row.brief as never,
      researchPacket: row.researchPacket as never, researchStatus: row.researchStatus,
      characters: row.characters as unknown[], locations: row.locations as unknown[],
    };
  },
  saveProject: async (id, patch) => {
    await db.update(projects).set(patch).where(sql`id = ${id}`);
  },
  saveScript: async (projectId, content) => {
    const [last] = await db.select({ version: scripts.version }).from(scripts)
      .where(sql`project_id = ${projectId}`).orderBy(desc(scripts.version)).limit(1);
    await db.insert(scripts).values({ id: randomUUID(), projectId, version: (last?.version ?? 0) + 1, content: content as never });
  },
  saveStoryboard: async (projectId, sb) => {
    const sbId = randomUUID();
    await db.insert(storyboards).values({ id: sbId, projectId, version: sb.version });
    const packs = sb.promptPacks as unknown[];
    let order = 1;
    for (let i = 0; i < sb.scenes.length; i++) {
      await db.insert(scenes).values({
        id: randomUUID(), storyboardId: sbId, order: order++, version: 1,
        title: sb.scenes[i].title, content: sb.scenes[i] as never, promptPack: packs[i] ?? null,
      });
    }
  },
};
```
(Add `import { desc, sql } from "drizzle-orm";`.)

The same file also exports the workflow factory the routes use:

```ts
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { buildWorkflow, type Provider } from "@slate/ai";

export function buildApiWorkflow(provider: Provider, checkpointer: PostgresSaver) {
  return buildWorkflow(provider, workflowDeps, checkpointer);
}
```
(Add `import { buildWorkflow, type Provider } from "@slate/ai";` and `import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";` to `workflow.ts`'s imports.)

`apps/api/src/routes/projects.ts`:
```ts
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { desc, sql } from "drizzle-orm";
import { db, projects, scripts, storyboards, scenes } from "@slate/db";
import { buildApiWorkflow } from "../workflow";
import { resumeWorkflow } from "@slate/ai";
import { getOwnedProject } from "../hooks"; // Task 2 — owner-scoped 404
import type { AppDeps } from "../app";

export async function projectRoutes(app: FastifyInstance, deps: AppDeps) {
  // requireUser (Task 2) already ran as a preHandler on /api/v1 — req.userId is set.
  app.post("/api/v1/projects", async (req, reply) => {
    const body = (req.body ?? {}) as { idea?: string };
    if (!body.idea?.trim()) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "idea required", details: {} } });
    const id = randomUUID();
    await db.insert(projects).values({ id, ownerId: req.userId, idea: body.idea.trim(), stage: "discovery" }); // owner-scoped (ADR-023)
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    // kick off the workflow; it will interrupt at discovery questions or the research gate
    await graph.invoke({ projectId: id }, { configurable: { thread_id: id } }).catch(() => {});
    return { project: { id, idea: body.idea.trim() } };
  });

  app.get("/api/v1/projects", async (req) => {
    const rows = await db.select().from(projects).where(sql`owner_id = ${req.userId}`).orderBy(desc(projects.updatedAt));
    return { projects: rows }; // only my projects
  });

  app.get("/api/v1/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getOwnedProject(req.userId, id); // 404 if not mine
    return { project: row };
  });

  app.post("/api/v1/projects/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getOwnedProject(req.userId, id);
    const body = (req.body ?? {}) as { content?: string };
    if (!body.content) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "content required", details: {} } });
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    await resumeWorkflow(graph, id, [body.content]);
    return { ok: true };
  });

  const stageApprove = async (stage: "research" | "script" | "storyboard") => {
    app.post(`/api/v1/projects/:id/stages/${stage}/approve`, async (req, reply) => {
      const { id } = req.params as { id: string };
      await getOwnedProject(req.userId, id);
      const body = (req.body ?? {}) as { approved?: boolean; feedback?: string };
      const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
      try {
        await resumeWorkflow(graph, id, { approved: body.approved ?? true, feedback: body.feedback });
      } catch (e) {
        if ((e as Error).message?.includes("no pending")) {
          return reply.code(409).send({ error: { code: "CONFLICT", message: "no pending interrupt for this stage", details: {} } });
        }
        throw e;
      }
      return { ok: true };
    });
    app.post(`/api/v1/projects/:id/stages/${stage}/regenerate`, async (req, reply) => {
      const { id } = req.params as { id: string };
      await getOwnedProject(req.userId, id);
      const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
      await resumeWorkflow(graph, id, { approved: false, feedback: "regenerate" });
      return { ok: true };
    });
  };
  await stageApprove("research");
  await stageApprove("script");
  await stageApprove("storyboard");

  app.get("/api/v1/projects/:id/production-plan", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await getOwnedProject(req.userId, id);
    const [sb] = await db.select().from(storyboards).where(sql`project_id = ${id}`).orderBy(desc(storyboards.version)).limit(1);
    const sceneRows = sb ? await db.select().from(scenes).where(sql`storyboard_id = ${sb.id}`).orderBy(scenes.order, desc(scenes.version)) : [];
    const latest = new Map<number, typeof sceneRows[number]>();
    for (const r of sceneRows) if (!latest.has(r.order)) latest.set(r.order, r);
    const ordered = [...latest.values()].sort((a, b) => a.order - b.order);
    const [script] = await db.select().from(scripts).where(sql`project_id = ${id}`).orderBy(desc(scripts.version)).limit(1);
    return {
      plan: {
        stage: row.stage, productionPlanStatus: row.productionPlanStatus,
        script: script?.content ?? null, scenes: ordered,
        characters: row.characters, locations: row.locations,
      },
    };
  });
}
```

`apps/api/src/routes/storyboard.ts`:
```ts
import type { FastifyInstance } from "fastify";
import { desc, sql } from "drizzle-orm";
import { db, storyboards, scenes } from "@slate/db";
import { getOwnedProject } from "../hooks"; // Task 2 — owner-scoped 404
import type { AppDeps } from "../app";

export async function storyboardRoutes(app: FastifyInstance, _deps: AppDeps) {
  app.get("/api/v1/projects/:id/storyboard", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getOwnedProject(req.userId, id); // owner-scoped (ADR-023)
    const [sb] = await db.select().from(storyboards).where(sql`project_id = ${id}`).orderBy(desc(storyboards.version)).limit(1);
    if (!sb) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "no storyboard yet", details: {} } });
    const rows = await db.select().from(scenes).where(sql`storyboard_id = ${sb.id}`).orderBy(scenes.order, desc(scenes.version));
    const latest = new Map<number, typeof rows[number]>();
    for (const r of rows) if (!latest.has(r.order)) latest.set(r.order, r);
    const ordered = [...latest.values()].sort((a, b) => a.order - b.order);
    return { storyboard: { version: sb.version, status: sb.status, scenes: ordered } };
  });
}
```

`apps/api/src/routes/scenes.ts`:
```ts
import type { FastifyInstance } from "fastify";
import { desc, eq, sql } from "drizzle-orm";
import { db, scenes, storyboards } from "@slate/db";
import { getOwnedProject } from "../hooks"; // Task 2 — owner-scoped 404
import type { AppDeps } from "../app";

export async function sceneRoutes(app: FastifyInstance, _deps: AppDeps) {
  // Edit a scene → insert a new version row (spec §12.9). body: { title, content }
  // Owner gate: the project must belong to req.userId (ADR-023) — else 404.
  app.put("/api/v1/projects/:id/scenes/:sceneId", async (req, reply) => {
    const { id, sceneId } = req.params as { id: string; sceneId: string };
    await getOwnedProject(req.userId, id); // 404 if not mine
    const body = (req.body ?? {}) as { title?: string; content?: unknown };
    const [current] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).orderBy(desc(scenes.version)).limit(1);
    if (!current) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "scene not found", details: {} } });
    await db.insert(scenes).values({
      id: crypto.randomUUID(), storyboardId: current.storyboardId,
      order: current.order, version: current.version + 1,
      title: body.title ?? current.title, content: (body.content ?? current.content) as never,
      promptPack: current.promptPack,
    });
    return { ok: true };
  });

  // Atomic reorder: one transaction. body: { scene_ids: string[] } (latest-version ids, new order).
  app.put("/api/v1/projects/:id/storyboard/order", async (req, reply) => {
    const { id } = req.params as { id: string };
    await getOwnedProject(req.userId, id); // owner-scoped (ADR-023)
    const body = (req.body ?? {}) as { scene_ids?: string[] };
    if (!body.scene_ids?.length) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "scene_ids required", details: {} } });
    try {
      await db.transaction(async (tx) => {
        const [sb] = await tx.select().from(storyboards).where(sql`project_id = ${id}`).orderBy(desc(storyboards.version)).limit(1);
        if (!sb) throw new Error("no storyboard");
        const rows = await tx.select().from(scenes)
          .where(sql`storyboard_id = ${sb.id}`).orderBy(scenes.order, desc(scenes.version));
        const latest = new Map<number, typeof rows[number]>();
        for (const r of rows) if (!latest.has(r.order)) latest.set(r.order, r);
        const ids = [...latest.values()].map((r) => r.id).sort();
        if (JSON.stringify([...body.scene_ids].sort()) !== JSON.stringify(ids)) throw new Error("stale");
        for (let i = 0; i < body.scene_ids.length; i++) {
          await tx.update(scenes).set({ order: i + 1 }).where(eq(scenes.id, body.scene_ids[i]));
        }
      });
    } catch (e) {
      if ((e as Error).message === "stale") {
        return reply.code(409).send({ error: { code: "CONFLICT", message: "scene set changed; refresh and retry", details: {} } });
      }
      throw e;
    }
    return { ok: true };
  });
}
```

`apps/api/src/routes/prompts.ts`:
```ts
import type { FastifyInstance } from "fastify";
import { desc, eq, sql } from "drizzle-orm";
import { db, projects, scenes } from "@slate/db";
import { getOwnedProject } from "../hooks"; // Task 2 — owner-scoped 404
import { promptAgent } from "@slate/ai";
import type { AppDeps } from "../app";

export async function promptRoutes(app: FastifyInstance, deps: AppDeps) {
  // Regenerate a scene's prompt pack → new scene version row. Threads the project's
  // stored characters and locations so the regenerated pack matches the production
  // plan (same inputs as the workflow's prompt_gen node).
  app.post("/api/v1/projects/:id/scenes/:sceneId/prompts/regenerate", async (req, reply) => {
    const { id, sceneId } = req.params as { id: string; sceneId: string };
    await getOwnedProject(req.userId, id); // owner-scoped (ADR-023)
    const [current] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).orderBy(desc(scenes.version)).limit(1);
    if (!current) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "scene not found", details: {} } });
    const [project] = await db.select().from(projects).where(sql`id = ${id}`);
    if (!project) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "project not found", details: {} } });
    const pack = await promptAgent(
      deps.provider, current.content as never,
      (project.characters ?? []) as never[], (project.locations ?? []) as never[],
    );
    await db.insert(scenes).values({
      id: crypto.randomUUID(), storyboardId: current.storyboardId,
      order: current.order, version: current.version + 1,
      title: current.title, content: current.content as never, promptPack: pack,
    });
    return { ok: true };
  });

  // Manual prompt pack edit → new scene version row. body: { promptPack }
  app.put("/api/v1/projects/:id/scenes/:sceneId/prompts", async (req, reply) => {
    const { id, sceneId } = req.params as { id: string; sceneId: string };
    await getOwnedProject(req.userId, id); // owner-scoped (ADR-023)
    const body = (req.body ?? {}) as { promptPack?: unknown };
    if (!body.promptPack) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "promptPack required", details: {} } });
    const [current] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).orderBy(desc(scenes.version)).limit(1);
    if (!current) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "scene not found", details: {} } });
    await db.insert(scenes).values({
      id: crypto.randomUUID(), storyboardId: current.storyboardId,
      order: current.order, version: current.version + 1,
      title: current.title, content: current.content as never, promptPack: body.promptPack,
    });
    return { ok: true };
  });
}
```

`apps/api/src/app.ts`:
```ts
import Fastify, { type FastifyInstance } from "fastify";
import { projectRoutes } from "./routes/projects";
import { storyboardRoutes } from "./routes/storyboard";
import { sceneRoutes } from "./routes/scenes";
import { promptRoutes } from "./routes/prompts";
import type { Provider } from "@slate/ai";
import type { TokenVerifier } from "./auth"; // Task 2

export interface AppDeps {
  provider: Provider;
  checkpointer: unknown;
  verifyToken: TokenVerifier; // Task 2 — Clerk JWT verification (injectable; fake in tests)
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify();
  app.register(projectRoutes, deps);
  app.register(storyboardRoutes, deps);
  app.register(sceneRoutes, deps);
  app.register(promptRoutes, deps);
  return app;
}
```

`apps/api/src/index.ts`:
```ts
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { runMigrations } from "@slate/db";
import { buildApp } from "./app";
import { createProvider } from "./provider";
import { makeVerifyToken } from "./auth"; // Task 2 — Clerk JWT verification

await runMigrations();
const checkpointer = await PostgresSaver.fromConnString(process.env.DATABASE_URL!);
const app = buildApp({ provider: createProvider(), checkpointer, verifyToken: makeVerifyToken() });
await app.listen({ port: 4000, host: "0.0.0.0" });
```

`apps/api/package.json`:
```json
{
  "name": "@slate/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": { "dev": "tsx watch src/index.ts", "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": {
    "@langchain/langgraph-checkpoint-postgres": "^0.1.0",
    "@slate/ai": "workspace:*",
    "@slate/db": "workspace:*",
    "@slate/shared": "workspace:*",
    "fastify": "^5.0.0",
    "tsx": "^4.19.0"
  },
  "devDependencies": { "@types/node": "^22.0.0", "typescript": "^5.7.0", "vitest": "^2.1.0" }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS. Then smoke: `docker compose up -d && pnpm --filter db migrate && pnpm --filter api dev`; create a project via curl with `FAKE_PROVIDER=1` (FakeProvider queue injected in tests only — for the smoke, set `FAKE_PROVIDER=1` and drive stages by hand or accept the error path).

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): projects, stage gates, storyboard, scene edit/reorder, prompts, production plan routes"
```

---

### Task 11: Next.js UI — auth pages + Cutting Room (`apps/web`)

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.mjs`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/page.tsx`, `apps/web/app/projects/[id]/page.tsx`, `apps/web/app/components/stage-stepper.tsx`, `apps/web/app/components/scene-card.tsx`, `apps/web/app/components/scene-editor.tsx`, `apps/web/app/components/prompts-panel.tsx`, `apps/web/app/components/production-plan.tsx`
- From Task 2: `apps/web/middleware.ts`, `apps/web/app/sign-in/[[...sign-in]]/page.tsx`, `apps/web/app/sign-up/[[...sign-up]]/page.tsx` (Clerk-hosted pages)
- Test: E2E in Task 13 (this task: typecheck + build)

**Interfaces:**
- Consumes: API at `NEXT_PUBLIC_API_URL` (Task 10 routes); Clerk session (Task 2).

**Visual source of truth:** `prototypes/cutting-room-full.html` (approved as-is, ADR-010) shows every screen, stage, state, and micro-interaction this task builds — port it, do not redesign. Walk it before starting: dashboard hero + slate grid, the 8-stage timecode stepper with REC dot and corner brackets, discovery conversation, brief cards, research packet, script editor with score bars, storyboard scene cards (`SC 01 · 00:42 · CUT`) with drag-to-reorder, scene editor with the Advanced toggle + prompt tabs, and the production-plan view with crew sheet. Each component below maps 1:1 to a prototype block; the states (loading skeleton, streaming caret, retake error, empty) are the same ones Task 13's E2E must not trip over.

- [ ] **Step 1: Extend the stepper**

`apps/web/app/components/stage-stepper.tsx` — stages `Idea → Brief → Research → Script → Storyboard → Scenes → Prompts → Ready`, timecode + REC dot per the token sheet:
```tsx
const STAGES = ["idea", "brief", "research", "script", "storyboard", "scenes", "prompts", "ready"] as const;
```
Active stage = the one whose index matches the project stage (map `done` → `ready`). Render each as `02 · 00:00:12 BRIEF ✓` / live stage with corner brackets + pulsing REC dot (respect `prefers-reduced-motion`).

- [ ] **Step 2: Build the scene card + drag-to-reorder**

`apps/web/app/components/scene-card.tsx` — a slate-line card (`SC 01 · 04.2s · CUT`) showing title, duration, transition, status chip; `draggable`, with `onDragStart`/`onDragOver`/`onDrop` handlers that call `onReorder(fromIndex, toIndex)`. **Must render `data-testid="scene-card-{order}"`** (the E2E drag assertion in Task 13 depends on it):
```tsx
export function SceneCard({ order, title, durationSeconds, transition, status, onReorder, index }: {
  order: number; title: string; durationSeconds: number; transition: string; status: string;
  onReorder: (from: number, to: number) => void; index: number;
}) {
  return (
    <div
      data-testid={`scene-card-${order}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(index))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onReorder(Number(e.dataTransfer.getData("text/plain")), index)}
      className="border border-line bg-surface px-4 py-3"
    >
      <span className="font-mono text-xs text-ash">SC {String(order).padStart(2, "0")} · {durationSeconds.toFixed(1)}s · {transition}</span>
      <div className="text-paper">{title}</div>
    </div>
  );
}
```

`apps/web/app/components/scene-editor.tsx` — per-scene fields (narration, visual description, camera direction, duration, transition, music cue) + a toggle:
```tsx
const [showAdvanced, setShowAdvanced] = useState(false);
// default view: narration + visual + camera + duration + transition + music cue (spec §7)
// showAdvanced: renders the prompt pack tabs via PromptsPanel — spec §12.10
type SceneEditorProps = {
  scene: SceneRow;
  onSave: (patch: { title?: string; content?: SceneContent }) => void;
  onRegeneratePrompts: () => void;
  onSavePrompts: (pack: PromptPack) => void;
};
```
The "Advanced" toggle reveals the prompt pack tabs (image/video/narration/music/SFX) — spec §12.10. Regenerate calls `POST .../scenes/:id/prompts/regenerate`; save calls `PUT .../scenes/:id/prompts`.

- [ ] **Step 3: Build the production-plan view**

`apps/web/app/components/production-plan.tsx` — reads `GET .../production-plan`; renders script (read-only), ordered scenes with their per-scene transitions/music cues and prompt packs, characters, locations, and an "Approve plan" action that is visible only when a storyboard gate is pending.

- [ ] **Step 4: Session-guarded shell (ADR-023)**

Auth UI is Clerk-hosted from Task 2: `apps/web/app/sign-in/[[...sign-in]]/page.tsx` + `sign-up/[[...sign-up]]/page.tsx` render Clerk's `<SignIn />` / `<SignUp />` components; `apps/web/middleware.ts` protects `/` and `/projects(.*)`. No custom forms to build — verify the catch-all routes render the token-sheet-styled paper panel.

`apps/web/app/page.tsx` (dashboard) and `apps/web/app/projects/[id]/page.tsx` (workspace) — **session-guarded**: use `@clerk/nextjs` `auth()` (server) / `useUser()` (client) from Task 2; while loading, render the agent-running skeleton; unauthenticated → redirect to `/sign-in`. The dashboard fetches `GET /api/v1/projects` (already owner-scoped server-side — only my projects).

- [ ] **Step 5: Wire the dashboard + workspace**

`apps/web/app/page.tsx` — idea input hero ("Describe your video idea" label + "Begin production" button → `POST /api/v1/projects` → redirect to `/projects/[id]`); project slate grid from `GET /api/v1/projects`.

`apps/web/app/projects/[id]/page.tsx` — stepper at top; below it, render by stage: brief review card, research packet, script (TipTap read-only + approve bar), and after the script gate is approved the storyboard section: scene list (drag-to-reorder → `PUT .../storyboard/order`, optimistic UI + refetch on `409`), scene editor (tap a scene to expand), prompt packs behind the Advanced toggle, and the approve bar with `POST .../stages/storyboard/approve`. When `productionPlanStatus === "ready"`, render `<ProductionPlan />`.

Apply the token sheet in `globals.css`:
```css
:root {
  --ink: #141110; --surface: #1E1A18; --paper: #EDE6DA; --paper-dim: #D9D0C0;
  --ash: #8C8378; --line: #2B2622; --rec: #E04B3A; --tungsten: #E2A85C;
}
```
Fonts: Cabinet Grotesk (display), General Sans (body), IBM Plex Mono (timecode). Radius 2px.

- [ ] **Step 6: Typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "feat(web): auth pages, session-guarded cutting room dashboard, stepper, reorder, prompt packs"
```

---

### Task 12: Test hardening — auth isolation, storyboard gates, reorder atomicity, scene versions (`packages/ai` + `apps/api`)

**Files:**
- Create: `packages/ai/src/workflow/production-plan.test.ts`
- Modify: `apps/api/src/app.test.ts` (extend)

**Interfaces:**
- Consumes: graph + deps (Task 9), routes (Task 10).
- Produces: coverage for the storyboard reject loop, storyboard interrupt persistence across a graph rebuild, reorder atomicity/409, scene version rows.

- [ ] **Step 1: Write the failing production-plan workflow test**

`packages/ai/src/workflow/production-plan.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildWorkflow, type WorkflowDeps } from "./graph";
import { resumeWorkflow } from "./resume";
import { FakeProvider } from "../providers/fake";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const TEST_URL = process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate";

const fakeDeps = (): WorkflowDeps => ({
  getProject: async (id: string) => ({
    id, idea: "doc about the universe", conversation: [], stage: "discovery", status: "active",
    brief: null, researchPacket: null, researchStatus: "pending", characters: [], locations: [],
  }),
  saveProject: async (_id, patch) => { expect(patch).toBeDefined(); },
  saveScript: async (_projectId, content) => { expect(content).toBeDefined(); },
  saveStoryboard: async (_projectId, sb) => { expect(sb.scenes.length).toBeGreaterThan(0); },
});

describe("storyboard gate reject loop + persistence", () => {
  let checkpointer: PostgresSaver;
  beforeAll(async () => { checkpointer = await PostgresSaver.fromConnString(TEST_URL); await checkpointer.setup(); });
  afterAll(async () => { await checkpointer.close(); });

  const base = [
    { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
    { content: '{"timeline":[],"concepts":[],"terminology":{},"references":[],"keyEvents":[]}' },
    { content: '{"title":"T","hook":"H","introduction":"I","body":["B"],"conclusion":"C","cta":null}' },
    { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    { content: '[]' },
    { content: '[]' },
  ];

  it("rejects the storyboard, regenerates with feedback, then approves", async () => {
    const scripted = [
      ...base,
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":30,"transition":"CUT","musicCue":"m"}]' }, // too long
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"DISSOLVE","musicCue":"strings swell"}]' }, // editor — per-scene fields only (spec §12.8)
      { content: '{"imagePrompt":"i","videoPrompt":"v","narrationPrompt":"n","musicPrompt":"m","sfxPrompt":"s"}' },
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"CUT","musicCue":"m"}]' }, // fixed
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"DISSOLVE","musicCue":"strings swell"}]' }, // editor — per-scene fields only (spec §12.8)
      { content: '{"imagePrompt":"i","videoPrompt":"v","narrationPrompt":"n","musicPrompt":"m","sfxPrompt":"s"}' },
    ];
    const graph = buildWorkflow(new FakeProvider(scripted), fakeDeps(), checkpointer);
    const threadId = "sb-reject";
    await graph.invoke({ projectId: threadId }, { configurable: { thread_id: threadId } }); // → research gate
    await resumeWorkflow(graph, threadId, { approved: true }); // → script gate
    await resumeWorkflow(graph, threadId, { approved: true }); // → storyboard gate
    await resumeWorkflow(graph, threadId, { approved: false, feedback: "scenes too long" }); // → storyboard again
    await resumeWorkflow(graph, threadId, { approved: true }); // → done
    const state = await graph.getState({ configurable: { thread_id: threadId } });
    expect(state.values.stage).toBe("done");
    expect(state.values.productionPlanStatus).toBe("ready");
  });

  it("survives a graph rebuild between the script and storyboard gates", async () => {
    const scripted = [...base,
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"CUT","musicCue":"m"}]' },
      { content: '[{"title":"S1","narration":"n","visualDescription":"v","cameraDirection":"c","durationSeconds":8,"transition":"DISSOLVE","musicCue":"strings swell"}]' }, // editor — per-scene fields only (spec §12.8)
      { content: '{"imagePrompt":"i","videoPrompt":"v","narrationPrompt":"n","musicPrompt":"m","sfxPrompt":"s"}' },
    ];
    // g1 runs through the research + script gates (consumes items 0-3: brief, research, script, review)
    const g1 = buildWorkflow(new FakeProvider(scripted.slice(0, 4)), fakeDeps(), checkpointer);
    const threadId = "sb-rebuild";
    await g1.invoke({ projectId: threadId }, { configurable: { thread_id: threadId } }); // → research gate
    await resumeWorkflow(g1, threadId, { approved: true }); // → script gate
    // g2 resumes the same thread with the remaining scripted items (characters, locations, storyboard, editor, prompts)
    const g2 = buildWorkflow(new FakeProvider(scripted.slice(4)), fakeDeps(), checkpointer);
    await resumeWorkflow(g2, threadId, { approved: true }); // → storyboard gate
    await resumeWorkflow(g2, threadId, { approved: true }); // approve storyboard → done
    const state = await g2.getState({ configurable: { thread_id: threadId } });
    expect(state.values.productionPlanStatus).toBe("ready");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ai test`
Expected: FAIL — file missing (or graph edge errors if topology is wrong).

- [ ] **Step 3: Extend API tests for auth isolation + reorder conflicts + version rows**

Append to `apps/api/src/app.test.ts`:
- **Auth isolation (ADR-023):** user A creates a project and drives it to a storyboard; user B (separate bearer token via the Task 2 fake verifier) gets **`404` on every owner-scoped route** — `GET /projects/:id`, `GET /projects/:id/storyboard`, `PUT /projects/:id/scenes/:sceneId`, `PUT /projects/:id/storyboard/order`, `POST /projects/:id/scenes/:sceneId/prompts/regenerate`, `POST /projects/:id/stages/storyboard/approve`, `GET /projects/:id/production-plan` — and user B's `GET /projects` list does **not** include user A's project.
- **Reorder 409:** drive to a storyboard, then send `PUT .../order` with a `scene_ids` list that doesn't match the server set → `409 CONFLICT`.
- **Scene version rows:** drive to a storyboard, `PUT .../scenes/:id { title: "v2" }`, then assert `GET .../storyboard` returns the latest title, and a direct DB count shows both versions for that `(storyboard_id, order)`.
- **Prompt regenerate:** drive to a storyboard, `POST .../scenes/:id/prompts/regenerate` (script an extra prompt call in FakeProvider), assert a new version row carries the new pack.

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: PASS across shared, db, ai, api.

- [ ] **Step 5: Commit**

```bash
git add packages/ai apps/api
git commit -m "test(ai,api): auth isolation 404s, storyboard gate loops, reorder 409, scene version rows"
```

---

### Task 13: E2E + full verification

**Files:**
- Create: `tests/package.json`, `tests/tsconfig.json`, `tests/playwright.config.ts`, `tests/e2e/production-plan.spec.ts`, `tests/e2e/auth.spec.ts`
- Modify: `apps/api/src/provider.ts` (scripted E2E queue)

**Interfaces:**
- Consumes: running web + api with `FAKE_PROVIDER=1`.

- [ ] **Step 1: Extend the E2E FakeProvider queue + write the spec**

`apps/api/src/provider.ts` — when `FAKE_PROVIDER=1`, use the full 10-call queue for E2E:
```ts
if (process.env.FAKE_PROVIDER === "1") {
  return new FakeProvider([
    { content: '{"kind":"brief","brief":{"topic":"History of the universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
    { content: '{"timeline":["13.8 bya: Big Bang"],"concepts":["cosmic inflation"],"terminology":{"redshift":"light stretched"},"references":["NASA WMAP"],"keyEvents":["first stars"]}' },
    { content: '{"title":"The First Three Minutes","hook":"13.8 billion years in one breath.","introduction":"Every atom in you was forged in a star.","body":["The bang.","The stars.","Us."],"conclusion":"We are the universe experiencing itself.","cta":null}' },
    { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    { content: '[]' }, // characters
    { content: '[]' }, // locations
    { content: '[{"title":"The Bang","narration":"13.8 billion years ago…","visualDescription":"A point erupts into light","cameraDirection":"Slow push-in","durationSeconds":8,"transition":"CUT","musicCue":"Low drone"},{"title":"The Stars","narration":"Then the stars were born.","visualDescription":"Nebulae form","cameraDirection":"Whip-pan","durationSeconds":6,"transition":"DISSOLVE","musicCue":"Strings"}]' },
    { content: '[{"title":"The Bang","narration":"13.8 billion years ago…","visualDescription":"A point erupts into light","cameraDirection":"Slow push-in","durationSeconds":8,"transition":"DISSOLVE","musicCue":"Low drone, strings swell"},{"title":"The Stars","narration":"Then the stars were born.","visualDescription":"Nebulae form","cameraDirection":"Whip-pan","durationSeconds":6,"transition":"DISSOLVE","musicCue":"Strings, building"}]' }, // editor
    { content: '{"imagePrompt":"still","videoPrompt":"slow zoom","narrationPrompt":"calm voice","musicPrompt":"ambient","sfxPrompt":"rumble"}' },
    { content: '{"imagePrompt":"stars","videoPrompt":"pan","narrationPrompt":"voice","musicPrompt":"strings","sfxPrompt":"chime"}' },
  ]);
}
```

`tests/e2e/production-plan.spec.ts` — **signs up first, then runs the flow**:
```ts
import { test, expect } from "@playwright/test";

// Clerk-hosted sign-up (Task 2) with test-mode credentials on the Clerk test instance.
async function signUp(page: import("@playwright/test").Page, tag: string) {
  await page.goto("/sign-up");
  await page.getByLabel(/email/i).fill(`${tag}${Date.now()}@test.dev`);
  await page.getByLabel(/password/i).fill("hunter2hunter2");
  await page.getByRole("button", { name: /create account|continue/i }).click();
  await page.waitForURL("/");
}

test("sign up → idea → approved production plan", async ({ page }) => {
  await signUp(page, "a");
  await page.getByLabel("Describe your video idea").fill("A documentary about the history of the universe");
  await page.getByRole("button", { name: /begin production/i }).click();
  await page.waitForURL(/\/projects\//);
  // research gate
  await expect(page.getByRole("button", { name: /approve & continue/i })).toBeVisible();
  await page.getByRole("button", { name: /approve & continue/i }).click();
  // script gate
  await expect(page.getByText(/script scores/i)).toBeVisible();
  await page.getByRole("button", { name: /approve & continue/i }).click();
  // storyboard: two scene cards, drag reorder S2 before S1
  const card1 = page.getByTestId("scene-card-1"); // S1 "The Bang"
  const card2 = page.getByTestId("scene-card-2"); // S2 "The Stars"
  await expect(card1).toBeVisible();
  await expect(card2).toBeVisible();
  await card2.dragTo(card1); // move S2 above S1
  await expect(page.getByTestId("scene-card-1")).toContainText(/The Stars/);
  // storyboard gate
  await page.getByRole("button", { name: /approve & continue/i }).click();
  // production plan ready
  await expect(page.getByText(/production plan/i)).toBeVisible();
  await expect(page.getByText(/ready/i)).toBeVisible();
});
```

`tests/e2e/auth.spec.ts` — **multi-user isolation (ADR-023)**:
```ts
import { test, expect } from "@playwright/test";

test("a second account cannot see or open the first account's project", async ({ browser }) => {
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  const pa = await alice.newPage();
  await pa.goto("/sign-up");
  await pa.getByLabel(/email/i).fill(`alice${Date.now()}@test.dev`);
  await pa.getByLabel(/password/i).fill("hunter2hunter2");
  await pa.getByRole("button", { name: /create account/i }).click();
  await pa.waitForURL("/");
  await pa.getByLabel("Describe your video idea").fill("A documentary about the universe");
  await pa.getByRole("button", { name: /begin production/i }).click();
  await pa.waitForURL(/\/projects\//);
  const aliceUrl = pa.url();

  const pb = await bob.newPage();
  await pb.goto("/sign-up");
  await pb.getByLabel(/email/i).fill(`bob${Date.now()}@test.dev`);
  await pb.getByLabel(/password/i).fill("hunter2hunter2");
  await pb.getByRole("button", { name: /create account/i }).click();
  await pb.waitForURL("/");
  await expect(pb.getByText(/history of the universe/i)).not.toBeVisible(); // not in bob's list
  await pb.goto(aliceUrl);
  await expect(pb.getByText(/not found/i)).toBeVisible(); // owner-scoped 404
  await alice.close();
  await bob.close();
});
```

`tests/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: [
    { command: "pnpm --filter web dev", url: "http://localhost:3000", reuseExistingServer: true },
    { command: "pnpm --filter api dev", url: "http://localhost:4000", reuseExistingServer: true, env: { FAKE_PROVIDER: "1", DATABASE_URL: "postgres://slate:slate@localhost:5432/slate", CLERK_SECRET_KEY: "<clerk-test-secret>", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "<clerk-test-publishable>" } },
    { command: "pnpm --filter web dev", url: "http://localhost:3000", reuseExistingServer: true, env: { CLERK_SECRET_KEY: "<clerk-test-secret>", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "<clerk-test-publishable>" } },
  ],
});
```
(The API applies migrations at boot; Docker Postgres must be up for the E2E. E2E auth runs against a **Clerk test instance** (ADR-023): both web and API need the same test `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and the sign-up strategy must be email+password with no verification for the helper above to pass.)

- [ ] **Step 2: Run E2E**

Run: `pnpm test:e2e`
Expected: PASS — sign up → idea → approved production plan, and `auth.spec.ts` proves a second account can't see/open the first account's project. No console errors.

- [ ] **Step 3: Full gate + demo check**

Run: `pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: all PASS. Then `docker compose up -d && pnpm dev`; open `http://localhost:3000`; run a project with `FAKE_PROVIDER=1` (or a real key) and verify the workspace stepper, scene reorder, Advanced toggle, and production-plan view render without console/page errors (per definition of done).

- [ ] **Step 4: Update docs status + commit**

- Mark `docs/specs/phase-1-foundation-design.md` `Implemented` in `docs/specs/README.md` and `docs/README.md`; update `docs/development-roadmap.md` Phase 1+2 to shipped.
- Commit: `git add -A && git commit -m "chore: phase 1+2 production plan implemented and verified"`
