# Vertical Slice (Idea → Approved Script) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the idea → approved-script loop end-to-end: a user types an idea, the studio interviews them, produces an editable brief and a quality-scored script with a review gate — running locally with 2 database tables and no auth.

**Architecture:** pnpm+Turborepo monorepo (`apps/web` Next.js, `apps/api` Fastify, `packages/ai`, `packages/db` Drizzle, `packages/shared`). LangGraph.js graph per project with a SQLite checkpointer (`SqliteSaver`); review gates via `interrupt()`; approval endpoints resume with `Command(resume=...)`. All AI calls through a `Provider` interface — NVIDIA Build (OpenAI-compatible) in prod, `FakeProvider` in tests. No queue, no auth, no media in this slice. **Zero containers:** the slice persists to a local SQLite file via better-sqlite3 (ADR-014).

**Tech Stack:** Node 20+, pnpm 9+, TypeScript strict, Next.js 14 (App Router), Fastify, Drizzle ORM + `drizzle-kit` (SQLite dialect), SQLite via `better-sqlite3`, LangGraph.js (`@langchain/langgraph`, `@langchain/langgraph-checkpoint-sqlite`), Zod, Tailwind + the approved "The Cutting Room" token sheet, Vitest, Playwright.

## Global Constraints

- **Repo:** pnpm workspace `apps/*` + `packages/*`; Turborepo pipelines for build/dev/typecheck/test (ADR-001).
- **TypeScript:** `strict: true` everywhere; shared types/zod/enums live in `packages/shared` — no duplicated types across packages.
- **DB:** SQLite via `better-sqlite3` (ADR-014 — slice-only, no containers; Postgres returns in full Phase 1+2); Drizzle ORM in its SQLite dialect (ADR-013); exactly 2 tables in this slice: `projects`, `scripts` (spec §6).
- **AI:** every agent output is Zod-validated; all calls go through the `Provider` interface (ADR-002) — agents never import an SDK directly.
- **Workflow:** LangGraph.js, `thread_id` = project id; review gates persist + exit (no long-lived HTTP); resume via `Command(resume=...)` (ADR-003).
- **Design:** only the approved token sheet (`ui-design.md`) — `--ink #141110`, `--surface #1E1A18`, `--paper #EDE6DA`, `--paper-dim #D9D0C0`, `--ash #8C8378`, `--line #2B2622`, `--rec #E04B3A`, `--tungsten #E2A85C`; fonts Cabinet Grotesk (display), General Sans (body), IBM Plex Mono (utility). Radius 2px. No ad-hoc colors.
- **API conventions:** `/api/v1`, JSON, single error shape `{ error: { code, message, details } }` (api-design.md).
- **Tests:** FakeProvider for all agent/workflow tests; no real provider calls in CI (testing-strategy.md).
- **Windows (Git Bash):** POSIX syntax; no Docker needed for the slice — the API boots and applies migrations itself.

---

## File Structure

```
videogen/
├── package.json                    # pnpm workspace root
├── turbo.json                      # pipeline definitions
├── pnpm-workspace.yaml
├── .env.example                    # DATABASE_PATH + provider keys
├── .gitignore
├── apps/
│   ├── web/                        # Next.js 14 App Router
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tsconfig.json
│   │   ├── tailwind.config.ts      # Cutting Room tokens as Tailwind theme
│   │   ├── postcss.config.mjs
│   │   └── app/
│   │       ├── layout.tsx          # fonts (Cabinet Grotesk, General Sans, IBM Plex Mono)
│   │       ├── globals.css         # CSS variables from token sheet
│   │       ├── page.tsx            # Dashboard: idea input + project grid
│   │       └── projects/[id]/page.tsx  # Workspace: stepper + stage + coverage + approve bar
│   └── api/                        # Fastify
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # build server, register routes, listen
│           ├── app.ts              # Fastify instance factory (testable)
│           ├── routes/             # one file per resource
│           │   ├── projects.ts
│           │   ├── stages.ts
│           │   ├── scripts.ts
│           │   └── stream.ts       # SSE
│           └── error.ts            # error serializer → single shape
├── packages/
│   ├── shared/                     # types + zod + enums
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── enums.ts            # ProjectStage, StageStatus, ScriptStatus, CreatedBy
│   │       └── schemas.ts          # Brief, ScriptContent, ReviewScores
│   ├── db/                         # Drizzle
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   └── src/
│   │       ├── schema.ts           # projects, scripts (sqlite dialect)
│   │       ├── client.ts           # better-sqlite3 + drizzle instance
│   │       └── migrate.ts          # runMigrations(): applies ./drizzle SQL at boot
│   └── ai/                         # providers + agents + workflow
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── providers/
│           │   ├── types.ts        # Provider interface, ModelRoute, ProviderError
│           │   ├── nvidia.ts       # NvidiaProvider (OpenAI-compatible, backoff/fallback)
│           │   └── fake.ts         # FakeProvider (scripted responses)
│           ├── agents/
│           │   ├── planning.ts     # interview → brief
│           │   ├── script.ts       # brief → script draft
│           │   └── reviewer.ts     # script → scores + notes
│           └── workflow/
│               ├── state.ts        # WorkflowState type + channels
│               ├── graph.ts        # nodes, edges, interrupt() gates, compile
│               └── resume.ts       # resumeWorkflow(graph, threadId, resume) → Command(resume=...)
└── tests/                          # top-level E2E
    ├── package.json
    └── e2e/vertical-slice.spec.ts  # Playwright
```

---

### Task 1: Monorepo scaffold + local infrastructure

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.env.example`

**Interfaces:**
- Produces: workspace with `apps/*`, `packages/*`; a SQLite file at `DATABASE_PATH` (default `./data/videogen.db`) created on first open. No Docker, no containers.

- [ ] **Step 1: Create workspace root files**

`package.json`:
```json
{
  "name": "videogen",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "pnpm --filter e2e test"
  },
  "devDependencies": {
    "turbo": "^2.3.0"
  }
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
*.db
*.db-shm
*.db-wal
```

**SQLite note:** the slice persists to one local file (default `./data/videogen.db`, override with `DATABASE_PATH`). No database server, no daemon, no container — better-sqlite3 opens the file synchronously on first use (ADR-014). Add `data/` to `.gitignore` (Step 3 does this).

`.env.example`:
```
DATABASE_PATH=./data/videogen.db
NVIDIA_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_API_URL=http://localhost:4000
FAKE_PROVIDER=0
```

- [ ] **Step 2: Verify zero-container setup**

Run: `mkdir -p data && echo "data/" >> .gitignore && git init`
Expected: `data/` exists and is gitignored; no containers anywhere. The SQLite file is created by better-sqlite3 when the db client first opens (Task 3).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm+turbo monorepo (zero-container sqlite slice)"
```

---

### Task 2: Shared types, enums, and zod schemas (`packages/shared`)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/enums.ts`, `packages/shared/src/schemas.ts`

**Interfaces:**
- Produces: `ProjectStage`, `StageStatus`, `ScriptStatus`, `CreatedBy`, `BriefSchema`, `ScriptContentSchema`, `ReviewScoresSchema`, and TS types inferred from them. Re-exported from `@videogen/shared`.

- [ ] **Step 1: Write the failing schema tests**

Create `packages/shared/src/schemas.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BriefSchema, ScriptContentSchema } from "./schemas";

describe("BriefSchema", () => {
  it("accepts a valid brief", () => {
    const brief = {
      topic: "History of the universe",
      audience: "general",
      platform: "youtube",
      style: "documentary",
      durationSeconds: 270,
      tone: "wonder",
      narration: "male",
      aspectRatio: "16:9",
    };
    expect(BriefSchema.safeParse(brief).success).toBe(true);
  });
  it("rejects a brief missing duration", () => {
    const bad = { topic: "x", audience: "general" };
    expect(BriefSchema.safeParse(bad).success).toBe(false);
  });
});

describe("ScriptContentSchema", () => {
  it("accepts a full script", () => {
    const script = {
      title: "The First Three Minutes",
      hook: "Thirteen point eight billion years, compressed into one breath.",
      introduction: "Every atom in your body was forged in a star.",
      body: ["Section one: the bang.", "Section two: the stars.", "Section three: us."],
      conclusion: "We are the universe experiencing itself.",
      cta: null,
    };
    expect(ScriptContentSchema.safeParse(script).success).toBe(true);
  });
  it("rejects missing body array", () => {
    const bad = { title: "x", hook: "y", introduction: "z" };
    expect(ScriptContentSchema.safeParse(bad).success).toBe(false);
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
  SCRIPT: "script",
  DONE: "done",
} as const;
export type ProjectStage = (typeof ProjectStage)[keyof typeof ProjectStage];

export const StageStatus = {
  IDLE: "idle",
  RUNNING: "running",
  AWAITING_REVIEW: "awaiting_review",
  APPROVED: "approved",
  FAILED: "failed",
} as const;
export type StageStatus = (typeof StageStatus)[keyof typeof StageStatus];

export const ScriptStatus = {
  DRAFT: "draft",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export type ScriptStatus = (typeof ScriptStatus)[keyof typeof ScriptStatus];

export const CreatedBy = { AI: "ai", USER: "user" } as const;
export type CreatedBy = (typeof CreatedBy)[keyof typeof CreatedBy];
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
```

`packages/shared/src/index.ts`:
```ts
export * from "./enums";
export * from "./schemas";
```

`packages/shared/package.json`:
```json
{
  "name": "@videogen/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^3.24.0" },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter shared test`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): enums and zod schemas for brief, script, scores"
```

---

### Task 3: Drizzle schema + migrations (`packages/db`)

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/migrate.ts`
- Test: `packages/db/src/schema.test.ts`

**Interfaces:**
- Consumes: `@videogen/shared` enums/types.
- Produces: Drizzle tables `projects` and `scripts` (sqlite dialect); `db` client (drizzle + better-sqlite3); `runMigrations()`.

- [ ] **Step 1: Write the failing repository test**

`packages/db/src/schema.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import Database from "better-sqlite3";
import { projects } from "./schema";

describe("db schema", () => {
  let db: ReturnType<typeof drizzle>;
  let conn: InstanceType<typeof Database>;
  beforeAll(() => {
    conn = new Database(":memory:");
    db = drizzle(conn);
    conn.exec(`
      CREATE TABLE projects (
        id text PRIMARY KEY,
        idea text NOT NULL,
        title text,
        stage text NOT NULL DEFAULT 'discovery',
        status text NOT NULL DEFAULT 'active',
        conversation text NOT NULL DEFAULT '[]',
        brief text,
        brief_history text NOT NULL DEFAULT '[]',
        created_at integer NOT NULL DEFAULT (unixepoch()),
        updated_at integer NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE scripts (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id),
        version integer NOT NULL,
        content text NOT NULL,
        review_scores text,
        review_notes text,
        created_by text NOT NULL DEFAULT 'ai',
        created_at integer NOT NULL DEFAULT (unixepoch()),
        UNIQUE (project_id, version)
      );
    `);
  });
  afterAll(() => { conn.close(); });

  it("round-trips a project", async () => {
    const row = { id: crypto.randomUUID(), idea: "doc about the universe" };
    await db.insert(projects).values(row);
    const got = await db.select().from(projects).where(sql`id = ${row.id}`);
    expect(got).toHaveLength(1);
    expect(got[0].idea).toBe(row.idea);
  });
});
```
(Test creates tables inline for isolation; the migration is verified separately in Step 5.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter db test`
Expected: FAIL — schema module missing / tables created by migration not by test. (Test creates tables inline for isolation; migration test comes later.)

- [ ] **Step 3: Write the schema**

`packages/db/src/schema.ts`:
```ts
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  idea: text("idea").notNull(),
  title: text("title"),
  stage: text("stage").notNull().default("discovery"),
  status: text("status").notNull().default("active"),
  conversation: text("conversation", { mode: "json" }).notNull().$type<{ role: "user" | "assistant"; content: string; at: string }[]>().default([]),
  brief: text("brief", { mode: "json" }).$type<unknown>(),
  briefHistory: text("brief_history", { mode: "json" }).notNull().$type<unknown[]>().default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
});

export const scripts = sqliteTable("scripts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  version: integer("version").notNull(),
  content: text("content", { mode: "json" }).notNull().$type<unknown>(),
  reviewScores: text("review_scores", { mode: "json" }).$type<unknown>(),
  reviewNotes: text("review_notes"),
  createdBy: text("created_by").notNull().default("ai"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().defaultNow(),
}, (t) => [uniqueIndex("scripts_project_version").on(t.projectId, t.version)]);
```
(SQLite mapping per ADR-014: uuid → `text` PK, jsonb → `text` with `{ mode: "json" }`, timestamptz → `integer` timestamp_ms.)

`packages/db/src/client.ts`:
```ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const path = process.env.DATABASE_PATH ?? "./data/videogen.db";
const sqlite = new Database(path);
// WAL so the LangGraph checkpointer (same file) and drizzle reads don't block each other.
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite, { schema });
export { sqlite };
```

`packages/db/src/migrate.ts`:
```ts
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client";

// Resolve relative to THIS module, not the caller's cwd (the API boots from apps/api).
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}
```

`packages/db/drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "./data/videogen.db" },
});
```

`packages/db/package.json`:
```json
{
  "name": "@videogen/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "generate": "drizzle-kit generate",
    "push": "drizzle-kit push",
    "migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@videogen/shared": "workspace:*",
    "better-sqlite3": "^11.7.0",
    "drizzle-orm": "^0.38.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/db/src/index.ts`: `export * from "./schema"; export { db, sqlite } from "./client"; export { runMigrations } from "./migrate";`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter db test`
Expected: PASS.

- [ ] **Step 5: Generate + apply migration to the SQLite file**

Run: `pnpm --filter db generate && pnpm --filter db migrate`
Expected: drizzle-kit generates SQL and applies it to `./data/videogen.db`. Verify: `node -e "const D=require('better-sqlite3');const db=new D('data/videogen.db');console.log(db.prepare(\"select name from sqlite_master where type='table'\").all())"` lists `projects` and `scripts` (plus drizzle journal tables).

- [ ] **Step 6: Commit**

```bash
git add packages/db
git commit -m "feat(db): projects and scripts schema (sqlite) with drizzle-kit migration"
```

---

### Task 4: Provider abstraction (`packages/ai` providers)

**Files:**
- Create: `packages/ai/package.json`, `packages/ai/tsconfig.json`, `packages/ai/src/index.ts`, `packages/ai/src/providers/types.ts`, `packages/ai/src/providers/nvidia.ts`, `packages/ai/src/providers/fake.ts`
- Test: `packages/ai/src/providers/types.test.ts`, `packages/ai/src/providers/nvidia.test.ts`

**Interfaces:**
- Consumes: `@videogen/shared` schemas.
- Produces:
  - `interface Provider { name: string; complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }> }`
  - `type ChatMessage = { role: "system" | "user" | "assistant"; content: string }`
  - `class ProviderError extends Error { constructor(msg, { code, retryable }) }` with codes `RATE_LIMITED | PROVIDER_FAILURE | INVALID_OUTPUT`.
  - `class NvidiaProvider implements Provider` (OpenAI-compatible, backoff on 429, retry-once on Zod failure).
  - `class FakeProvider implements Provider` (scripted per-call responses; throws on unexpected call).

- [ ] **Step 1: Write the failing tests**

`packages/ai/src/providers/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FakeProvider } from "./fake";
import { z } from "zod";

describe("FakeProvider", () => {
  it("returns the next scripted output and validates schema", async () => {
    const p = new FakeProvider([
      { content: '{"topic":"universe"}' },
    ]);
    const schema = z.object({ topic: z.string() });
    const res = await p.complete({ messages: [{ role: "user", content: "hi" }], schema });
    expect(res.output).toEqual({ topic: "universe" });
  });
  it("throws when the queue is exhausted", async () => {
    const p = new FakeProvider([]);
    await expect(p.complete({ messages: [{ role: "user", content: "hi" }], schema: z.object({}) }))
      .rejects.toThrow(/no scripted response/i);
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
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"topic":"universe"}' } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const p = new NvidiaProvider({ apiKey: "k", model: "nvidia/llama-3.3-70b", baseUrl: "https://integrate.api.nvidia.com/v1" });
    const res = await p.complete({
      messages: [{ role: "user", content: "make a brief" }],
      schema: z.object({ topic: z.string() }),
    });
    expect(res.output).toEqual({ topic: "universe" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
  });
  it("retries once on 429 then throws ProviderError(RATE_LIMITED)", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) }));
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
  constructor(public code: ProviderErrorCode, message: string) {
    super(message);
    this.name = "ProviderError";
  }
}
```

`packages/ai/src/providers/fake.ts`:
```ts
import type { Provider, ChatMessage } from "./types";
import type { ZodType } from "zod";

export class FakeProvider implements Provider {
  readonly name = "fake";
  private queue: { content: string }[];
  constructor(scripted: { content: string }[]) { this.queue = [...scripted]; }
  async complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }> {
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
  private cfg: Required<NvidiaConfig> & { maxRetries: number };
  constructor(cfg: NvidiaConfig) {
    this.cfg = { baseUrl: "https://integrate.api.nvidia.com/v1", maxRetries: 2, ...cfg };
  }

  async complete<T>(input: { messages: ChatMessage[]; schema: ZodType<T> }): Promise<{ output: T; raw: string; route: string }> {
    const { apiKey, model, baseUrl, maxRetries } = this.cfg;
    const body = {
      model,
      messages: input.messages,
      temperature: 0.7,
      response_format: { type: "json_object" },
    };
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

`packages/ai/src/index.ts`:
```ts
export * from "./providers/types";
export * from "./providers/nvidia";
export * from "./providers/fake";
export * from "./agents/planning";
export * from "./agents/script";
export * from "./agents/reviewer";
export * from "./workflow/state";
export * from "./workflow/graph";
export * from "./workflow/resume";
```

`packages/ai/package.json`:
```json
{
  "name": "@videogen/ai",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@langchain/langgraph": "^0.2.0",
    "@langchain/langgraph-checkpoint-sqlite": "^0.1.0",
    "@videogen/shared": "workspace:*",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
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

### Task 5: Agents (`packages/ai` agents)

**Files:**
- Create: `packages/ai/src/agents/planning.ts`, `packages/ai/src/agents/script.ts`, `packages/ai/src/agents/reviewer.ts`
- Test: `packages/ai/src/agents/planning.test.ts`

**Interfaces:**
- Consumes: `Provider` (Task 4), `@videogen/shared` schemas.
- Produces:
  - `planningAgent(provider, idea, conversation): Promise<{ questions?: string[] } | { brief: Brief }>`
  - `scriptAgent(provider, brief, feedback?): Promise<ScriptContent>`
  - `reviewerAgent(provider, script): Promise<ReviewScores>`
  - Shared `systemPrompt(role: string): string`

- [ ] **Step 1: Write the failing test**

`packages/ai/src/agents/planning.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planningAgent } from "./planning";
import { FakeProvider } from "../providers/fake";

describe("planningAgent", () => {
  it("asks questions first, then produces a brief", async () => {
    const p = new FakeProvider([
      { content: '{"questions":["What platform?","How long?"]}' },
      { content: '{"brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
    ]);
    const first = await planningAgent(p, "doc about the universe", []);
    expect(first).toHaveProperty("questions");
    const second = await planningAgent(p, "doc about the universe", [
      { role: "user", content: "youtube, 4:30" },
    ]);
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
import { BriefSchema } from "@videogen/shared";

const PlanningOutputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("questions"), questions: z.array(z.string()).min(1).max(4) }),
  z.object({ kind: z.literal("brief"), brief: BriefSchema }),
]);

export async function planningAgent(provider: Provider, idea: string, conversation: ChatMessage[]): Promise<
  { kind: "questions"; questions: string[] } | { kind: "brief"; brief: z.infer<typeof BriefSchema> }
> {
  const sys = "You are the Planning Agent of an AI video studio. Interview the user minimally. " +
    "Ask only questions you cannot infer. When you have enough, emit a brief. Reply strictly as JSON: " +
    '{"kind":"questions","questions":[...]} or {"kind":"brief","brief":{...}} matching the brief shape: ' +
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
import { ScriptContentSchema, type Brief } from "@videogen/shared";
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
import { ReviewScoresSchema, type ScriptContent } from "@videogen/shared";
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter ai test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents
git commit -m "feat(ai): planning, script, and reviewer agents"
```

---

### Task 6: LangGraph workflow (`packages/ai` workflow)

**Files:**
- Create: `packages/ai/src/workflow/state.ts`, `packages/ai/src/workflow/graph.ts`, `packages/ai/src/workflow/resume.ts`
- Test: `packages/ai/src/workflow/graph.test.ts`

**Interfaces:**
- Consumes: agents (Task 5), `Provider`, `db` (Task 3), `@videogen/shared` types.
- Produces:
  - `type WorkflowState` (typed channels, below)
  - `buildWorkflow(provider: Provider, deps: { getProject, saveProject, saveScript }, checkpointer?: unknown): CompiledGraph` — `checkpointer` is required for interrupt persistence (Task 9).
  - `resumeWorkflow(graph, threadId: string, resume: { approved: boolean; feedback?: string } | string[]): Promise<Record<string, unknown>>` — returns the invoke result so callers can read `__interrupt__`.

- [ ] **Step 1: Write the failing workflow test**

`packages/ai/src/workflow/graph.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { buildWorkflow, type WorkflowDeps } from "./graph";
import { resumeWorkflow } from "./resume";
import { FakeProvider } from "../providers/fake";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const TEST_PATH = "./data/test-workflow.db";

const fakeDeps = (): WorkflowDeps => ({
  getProject: async (id: string) => ({
    id, idea: "doc about the universe",
    conversation: [], stage: "discovery", status: "active", brief: null,
  }),
  saveProject: async (_id, patch) => { expect(patch).toBeDefined(); },
  saveScript: async (_projectId, content) => { expect(content).toBeDefined(); },
});

// Uses the real SQLite checkpointer so interrupt state truly persists across calls.
describe("workflow happy path", () => {
  let checkpointer: SqliteSaver;
  beforeAll(() => {
    mkdirSync("./data", { recursive: true });
    rmSync(TEST_PATH, { force: true }); // hermetic: fresh file per run
    checkpointer = SqliteSaver.fromConnString(TEST_PATH);
  });
  afterAll(() => { (checkpointer as SqliteSaver).close?.(); });

  it("runs discovery→brief→script→review, pausing at the script gate", async () => {
    const p = new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    ]);
    const graph = buildWorkflow(p, fakeDeps(), checkpointer);
    const first = await graph.invoke({ projectId: "p1" }, { configurable: { thread_id: "p1" } });
    // Graph pauses at the script gate (the slice's single review gate).
    expect(first.__interrupt__?.length ?? 0).toBeGreaterThan(0);
    // Approve script → done.
    await resumeWorkflow(graph, "p1", { approved: true });
    const state = await graph.getState({ configurable: { thread_id: "p1" } });
    expect(state.values.stage).toBe("done");
  });
});

describe("workflow reject loop", () => {
  let checkpointer: SqliteSaver;
  beforeAll(() => {
    mkdirSync("./data", { recursive: true });
    rmSync(TEST_PATH, { force: true }); // hermetic: fresh file per run
    checkpointer = SqliteSaver.fromConnString(TEST_PATH);
  });
  afterAll(() => { (checkpointer as SqliteSaver).close?.(); });

  it("rejects the script, regenerates with feedback, then approves to done", async () => {
    const p = new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":2,"pacing":2,"engagement":2,"retention":2,"redundancy":2,"notes":["weak hook"],"overall":2}' },
      { content: '{"title":"T2","hook":"H2","introduction":"I2","body":["B2"],"conclusion":"C2","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    ]);
    const graph = buildWorkflow(p, fakeDeps(), checkpointer);
    const threadId = "p-reject";
    await graph.invoke({ projectId: threadId }, { configurable: { thread_id: threadId } });            // → script gate (low scores)
    await resumeWorkflow(graph, threadId, { approved: false, feedback: "fix the hook" });              // reject → regenerate script → review → script gate
    await resumeWorkflow(graph, threadId, { approved: true });                                         // approve → done
    const state = await graph.getState({ configurable: { thread_id: threadId } });
    expect(state.values.stage).toBe("done");
  });
});
```

Note: this uses LangGraph's real HITL API — `interrupt()` inside the gate nodes, `Command(resume=...)` to resume, `__interrupt__` in the returned state to detect a pause. This is also exactly what the API (Task 7) needs, so the tests double as the integration spec for approve/resume.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter ai test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

`packages/ai/src/workflow/state.ts`:
```ts
import { Annotation } from "@langchain/langgraph";
import type { Brief, ScriptContent, ReviewScores } from "@videogen/shared";

export const WorkflowState = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, b) => b }),
  stage: Annotation<string>({ reducer: (_, b) => b }),
  brief: Annotation<Brief | null>({ reducer: (_, b) => b, default: () => null }),
  script: Annotation<ScriptContent | null>({ reducer: (_, b) => b, default: () => null }),
  scores: Annotation<ReviewScores | null>({ reducer: (_, b) => b, default: () => null }),
  feedback: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
});
export type WorkflowState = typeof WorkflowState.State;
```

`packages/ai/src/workflow/graph.ts`:
```ts
import { StateGraph, START, END, interrupt, type CompiledGraph } from "@langchain/langgraph";
import { WorkflowState } from "./state";
import { planningAgent, scriptAgent, reviewerAgent } from "../agents";
import type { Provider } from "../providers/types";
import type { Brief, ScriptContent } from "@videogen/shared";

export interface WorkflowDeps {
  getProject(id: string): Promise<{ id: string; idea: string; conversation: unknown[]; stage: string; status: string; brief: unknown }>;
  saveProject(id: string, patch: Record<string, unknown>): Promise<void>;
  saveScript(projectId: string, content: ScriptContent): Promise<void>;
}

export function buildWorkflow(provider: Provider, deps: WorkflowDeps, checkpointer?: unknown): CompiledGraph<typeof WorkflowState.State> {
  const graph = new StateGraph(WorkflowState);

  graph.addNode("discovery", async (state) => {
    const project = await deps.getProject(state.projectId);
    const result = await planningAgent(provider, project.idea, project.conversation as never);
    if (result.kind === "questions") {
      // Pause for the user's answers; resume value = string[] of answers.
      const answers = interrupt<string[]>("discovery_questions");
      await deps.saveProject(state.projectId, {
        conversation: [
          ...project.conversation,
          { role: "assistant", content: result.questions.join("\n"), at: new Date().toISOString() },
          { role: "user", content: answers.join("\n"), at: new Date().toISOString() },
        ],
      });
      return { stage: "discovery" };
    }
    await deps.saveProject(state.projectId, { brief: result.brief, stage: "brief" });
    return { stage: "brief", brief: result.brief };
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
    return { stage: "done" };
  });

  graph.addEdge(START, "discovery");
  graph.addConditionalEdges("discovery", (s) => (s.brief ? "script" : "discovery"));
  graph.addEdge("script", "review");
  graph.addEdge("review", "script_gate");
  graph.addConditionalEdges("script_gate", (s) => (s.stage === "done" ? END : "script"));

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

**Step 3 note (interrupt wiring):** `interrupt()` inside the gate nodes pauses the graph and persists state via the checkpointer; `resumeWorkflow` resumes with `Command(resume=...)`. The discovery interview pauses with `interrupt<string[]>` (answers), the script gate with `interrupt<{ approved, feedback? }>`. The returned `__interrupt__` array in invoke results indicates a pending pause — the API and UI use it to know when to show the approval bar.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter ai test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/workflow
git commit -m "feat(ai): langgraph workflow with review gates and resume"
```

---

### Task 7: Fastify API (`apps/api`)

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/error.ts`, `apps/api/src/routes/projects.ts`, `apps/api/src/routes/stages.ts`, `apps/api/src/routes/scripts.ts`, `apps/api/src/routes/stream.ts`
- Test: `apps/api/src/app.test.ts`

`apps/api/vitest.config.ts` (isolates the API tests to their own sqlite file so module-level
`DATABASE_PATH` in `@videogen/db` matches `TEST_PATH` in the test):
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { env: { DATABASE_PATH: "./data/test-api.db" } },
});
```

**Interfaces:**
- Consumes: `@videogen/shared`, `@videogen/db`, `@videogen/ai` (workflow + providers).
- Produces: Fastify instance `buildApp(deps)`; HTTP surface per api-design.md (projects, conversation, stages approve/regenerate, script versions, SSE, health). No auth in the slice.

- [ ] **Step 1: Write the failing integration test**

`apps/api/src/app.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { buildApp } from "./app";
import { FakeProvider } from "@videogen/ai";
import { runMigrations } from "@videogen/db";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const TEST_PATH = process.env.DATABASE_PATH ?? "./data/test-api.db";

describe("api", () => {
  let checkpointer: SqliteSaver;
  beforeAll(async () => {
    mkdirSync("./data", { recursive: true });
    rmSync(TEST_PATH, { force: true }); // hermetic: fresh file per run
    await runMigrations(); // projects/scripts tables must exist before routes insert
    checkpointer = SqliteSaver.fromConnString(TEST_PATH);
  });
  afterAll(() => { (checkpointer as SqliteSaver).close?.(); });

  it("creates a project and runs discovery to the script gate", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    ]), checkpointer });
    const res = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc about the universe" } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.project.id).toBeTruthy();
    // The workflow pauses at the script gate; the DB row reflects it.
    expect(body.project.stage).toBe("script");
  });

  it("returns a single error shape on validation failure", async () => {
    const app = buildApp({ provider: new FakeProvider([]), checkpointer });
    const res = await app.inject({ method: "POST", url: "/api/v1/projects", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/app.ts`:
```ts
import Fastify from "fastify";
import type { Checkpointer } from "@langchain/langgraph";
import type { Provider } from "@videogen/ai";
import { projectRoutes } from "./routes/projects";
import { stageRoutes } from "./routes/stages";
import { scriptRoutes } from "./routes/scripts";
import { streamRoute } from "./routes/stream";

export interface AppDeps { provider: Provider; checkpointer: Checkpointer }

export function buildApp(deps: AppDeps) {
  const app = Fastify({ logger: true });
  app.register(projectRoutes, deps);
  app.register(stageRoutes, deps);
  app.register(scriptRoutes, deps);
  app.register(streamRoute, deps);
  app.get("/api/v1/health", async () => ({ status: "ok" }));
  app.setErrorHandler((err, _req, reply) => {
    reply.status(err.statusCode ?? 500).send({ error: { code: err.code ?? "INTERNAL", message: err.message, details: {} } });
  });
  return app;
}
```

`apps/api/src/workflow.ts` (shared DB-backed workflow wiring, used by projects + stages):
```ts
import { eq } from "drizzle-orm";
import { buildWorkflow, type WorkflowDeps } from "@videogen/ai";
import type { Checkpointer } from "@langchain/langgraph";
import { db, projects, scripts } from "@videogen/db";
import type { Provider } from "@videogen/ai";

const workflowDeps: WorkflowDeps = {
  getProject: async (id) => {
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw new Error("project not found");
    return {
      id: row.id, idea: row.idea, conversation: (row.conversation as never[]) ?? [],
      stage: row.stage, status: row.status, brief: row.brief,
    };
  },
  saveProject: async (id, patch) => {
    await db.update(projects).set({ ...patch, updatedAt: new Date() }).where(eq(projects.id, id));
  },
  saveScript: async (projectId, content) => {
    const [latest] = await db.select({ version: scripts.version }).from(scripts)
      .where(eq(scripts.projectId, projectId)).orderBy(desc(scripts.version)).limit(1);
    await db.insert(scripts).values({ projectId, version: (latest?.version ?? 0) + 1, content, createdBy: "ai" });
  },
};

export function buildApiWorkflow(provider: Provider, checkpointer: Checkpointer) {
  return buildWorkflow(provider, workflowDeps, checkpointer);
}
```
(Add `import { desc } from "drizzle-orm";`.)

`apps/api/src/routes/projects.ts`:
```ts
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, projects } from "@videogen/db";
import { buildApiWorkflow } from "../workflow";
import type { AppDeps } from "../app";

export async function projectRoutes(app: FastifyInstance, deps: AppDeps) {
  app.post("/api/v1/projects", async (req, reply) => {
    const { idea } = (req.body ?? {}) as { idea?: string };
    if (!idea || typeof idea !== "string") {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "idea is required", details: {} } });
    }
    const id = randomUUID();
    await db.insert(projects).values({ id, idea, conversation: [], briefHistory: [] });
    // Run the workflow synchronously to its first interrupt (the script gate).
    const graph = buildApiWorkflow(deps.provider, deps.checkpointer);
    await graph.invoke({ projectId: id }, { configurable: { thread_id: id } });
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "project not found", details: {} } });
    return reply.code(201).send({ project: row });
  });
  app.get("/api/v1/projects", async () => {
    const rows = await db.select().from(projects).orderBy(projects.updatedAt);
    return { projects: rows };
  });
  app.get("/api/v1/projects/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await db.select().from(projects).where(eq(projects.id, id));
    if (!row.length) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "project not found", details: {} } });
    return { project: row[0] };
  });
}
```

**Provider selection by env** — `apps/api/src/provider.ts`:
```ts
import { NvidiaProvider, FakeProvider, type Provider } from "@videogen/ai";

export function createProvider(): Provider {
  if (process.env.FAKE_PROVIDER === "1") {
    // Scripted sequence matching the E2E flow: brief → script → high scores.
    return new FakeProvider([
      { content: '{"kind":"brief","brief":{"topic":"History of the universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"The First Three Minutes","hook":"13.8 billion years in one breath.","introduction":"Every atom in you was forged in a star.","body":["The bang.","The stars.","Us."],"conclusion":"We are the universe experiencing itself.","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    ]);
  }
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is required when FAKE_PROVIDER != 1");
  return new NvidiaProvider({ apiKey, model: "nvidia/llama-3.3-70b" });
}
```
`apps/api/src/index.ts`:
```ts
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { runMigrations } from "@videogen/db";
import { buildApp } from "./app";
import { createProvider } from "./provider";

await runMigrations();
const checkpointer = SqliteSaver.fromConnString(process.env.DATABASE_PATH ?? "./data/videogen.db");
const app = buildApp({ provider: createProvider(), checkpointer });
await app.listen({ port: 4000, host: "0.0.0.0" });
```

`apps/api/src/routes/stages.ts`, `scripts.ts`, `stream.ts`:
- `stages.ts`: `GET /api/v1/projects/:id/stages` (derived from project row + latest script), `GET /api/v1/projects/:id/stages/:stage`, `POST /api/v1/projects/:id/stages/:stage/approve` (resume workflow via `resumeWorkflow`), `POST /api/v1/projects/:id/stages/:stage/regenerate` (re-run producing agent).
- `scripts.ts`: `PUT /api/v1/projects/:id/scripts/:scriptId/versions` (user edit → new row, `created_by: "user"`, `version = max+1`), `GET /api/v1/projects/:id/scripts/:scriptId/versions` (ordered desc).
- `stream.ts`: SSE route — hold a connection, emit `stage:started | stage:awaiting_review | stage:done | stage:failed` based on project status changes (poll the project row every 500ms for the slice; replace with push later). Keep it simple and correct: send a heartbeat comment every 15s to prevent idle disconnect.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api test`
Expected: PASS. (Tests use an isolated sqlite file via `DATABASE_PATH` set in `apps/api/vitest.config.ts`; no Docker.)

- [ ] **Step 5: Manual smoke test**

Run: `pnpm --filter db migrate && pnpm --filter api dev`
Then: `curl -s -X POST localhost:4000/api/v1/projects -H 'content-type: application/json' -d '{"idea":"doc about the universe"}'`
Expected: JSON project with stage `script` (the workflow pauses at the script gate). Run with
`FAKE_PROVIDER=1` for a deterministic scripted run, or a real `NVIDIA_API_KEY` for a live one.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): fastify routes for projects, stages, scripts, and SSE"
```

---

### Task 8: Next.js UI (`apps/web`) — Cutting Room

**Files:**
- Create: `apps/web/package.json`, `apps/web/next.config.mjs`, `apps/web/tsconfig.json`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/page.tsx`, `apps/web/app/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: API at `NEXT_PUBLIC_API_URL`.
- Produces: Dashboard (`/`) with idea input + project grid; Workspace (`/projects/[id]`) with the slate/timecode stepper, stage content, coverage rail, and approve bar; token-driven styling.

- [ ] **Step 1: Write the failing E2E spec (checked in, run later in Task 10)**

`tests/e2e/vertical-slice.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test("idea → approved script flow", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your video idea").fill("A documentary about the history of the universe");
  await page.getByRole("button", { name: /begin production/i }).click();
  await page.waitForURL(/\/projects\//);
  // POST /projects ran the workflow to the script gate (FakeProvider scripted in test env):
  await expect(page.getByText(/script scores/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /approve & continue/i })).toBeVisible();
  await page.getByRole("button", { name: /approve & continue/i }).click();
  // script approved → done
  await expect(page.getByText(/ready|production plan/i)).toBeVisible();
});
```

- [ ] **Step 2: Scaffold the app**

Run: `pnpm create next-app@14 apps/web --ts --tailwind --app --no-eslint --no-src-dir --import-alias "@/*"` then prune to the files listed above. Set `next.config.mjs` with `transpilePackages: ["@videogen/shared"]`.

- [ ] **Step 3: Wire the token sheet**

`apps/web/tailwind.config.ts` (extend theme with the approved tokens; note: fonts load via `next/font` in layout, tailwind just references them):
```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#141110",
        surface: "#1E1A18",
        paper: "#EDE6DA",
        paperDim: "#D9D0C0",
        ash: "#8C8378",
        line: "#2B2622",
        rec: "#E04B3A",
        tungsten: "#E2A85C",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: { slate: "2px" },
    },
  },
  plugins: [],
} satisfies Config;
```

`apps/web/app/layout.tsx` — load fonts via `next/font/google` (IBM Plex Mono) + `next/font/local` or Fontshare CDN link for Cabinet Grotesk + General Sans; set CSS vars `--font-display`, `--font-body`, `--font-mono`.

- [ ] **Step 4: Build the Dashboard**

`apps/web/app/page.tsx`: hero ("What do you want to make?"), idea input (mono eyebrow, rec focus ring), "Begin production" button → `POST {NEXT_PUBLIC_API_URL}/api/v1/projects` → router.push to workspace; project grid using `GET /api/v1/projects` with slate cards (title, stage timecode, status chip, progress). Match the approved mockup (`prototypes/cutting-room.html`) — stepper strip, REC dot, brackets.

- [ ] **Step 5: Build the Workspace**

`apps/web/app/projects/[id]/page.tsx`: fetch project + stage state; render the slate/timecode stepper (slice stages: Idea, Brief, Script, Review → "Ready"), main panel per stage (brief cards / script with scores), coverage rail (scores bars, versions), fixed approve bar. Wire approve → `POST .../stages/:stage/approve` then refetch. Use `EventSource` on `/api/v1/projects/:id/stream` for live stage events (fall back to polling if SSE errors).

- [ ] **Step 6: Typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web tests
git commit -m "feat(web): cutting room dashboard and workspace UI"
```

---

### Task 9: Workflow + API test hardening (FakeProvider)

**Files:**
- Create: `packages/ai/src/workflow/interrupt.test.ts`
- Modify: `apps/api/src/app.test.ts` (extend)

- [ ] **Step 1: Write the interrupt-persistence test**

`packages/ai/src/workflow/interrupt.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync, mkdirSync } from "node:fs";
import { buildWorkflow, type WorkflowDeps } from "./graph";
import { FakeProvider } from "../providers/fake";
import { resumeWorkflow } from "./resume";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const TEST_PATH = "./data/test-interrupt.db";

// Self-contained helper: an engineer reads this task alone.
const fakeDeps = (): WorkflowDeps => ({
  getProject: async (id: string) => ({
    id, idea: "doc about the universe",
    conversation: [], stage: "discovery", status: "active", brief: null,
  }),
  saveProject: async (_id, patch) => { expect(patch).toBeDefined(); },
  saveScript: async (_projectId, content) => { expect(content).toBeDefined(); },
});

describe("interrupt persistence", () => {
  let checkpointer: SqliteSaver;
  beforeAll(() => {
    mkdirSync("./data", { recursive: true });
    rmSync(TEST_PATH, { force: true }); // hermetic: fresh file per run
    checkpointer = SqliteSaver.fromConnString(TEST_PATH);
  });
  afterAll(() => { (checkpointer as SqliteSaver).close?.(); });

  it("survives a graph rebuild between interrupts", async () => {
    const scripted = [
      { content: '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}' },
      { content: '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}' },
      { content: '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}' },
    ];
    // graph instance 1: run to first interrupt (script gate)
    const g1 = buildWorkflow(new FakeProvider(scripted.slice(0, 3)), fakeDeps(), checkpointer);
    await g1.invoke({ projectId: "p1" }, { configurable: { thread_id: "p1" } });
    // graph instance 2: resume with the SAME checkpointer (new process = new graph object)
    const g2 = buildWorkflow(new FakeProvider([]), fakeDeps(), checkpointer);
    await resumeWorkflow(g2, "p1", { approved: true }); // script approved → done
    const state = await g2.getState({ configurable: { thread_id: "p1" } });
    expect(state.values.stage).toBe("done");
  });
});
```
(The SQLite-backed checkpointer is what makes "survives rebuild" meaningful — graph instance 2 has no memory of instance 1 except what's persisted in the sqlite file.)

- [ ] **Step 2: Run test, fix, pass**

Run: `pnpm --filter ai test`
Expected: PASS (the `checkpointer` param from Task 6 is already wired here — this test proves a rebuilt graph instance resumes the same persisted thread).

- [ ] **Step 3: Extend API tests for stage lifecycle**

Add to `apps/api/src/app.test.ts`: create project → `POST .../stages/script/approve { approved: true }` → project stage advances; `approve` on a stage with no pending interrupt returns `409 CONFLICT`.

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: PASS across shared, db, ai, api.

- [ ] **Step 5: Commit**

```bash
git add packages/ai apps/api
git commit -m "test(ai,api): interrupt persistence and stage lifecycle coverage"
```

---

### Task 10: E2E + full verification

**Files:**
- Create: `tests/package.json`, `tests/playwright.config.ts`

- [ ] **Step 1: Add test harness**

`tests/package.json`:
```json
{
  "name": "@videogen/e2e",
  "version": "0.0.0",
  "private": true,
  "scripts": { "test": "playwright test" },
  "devDependencies": { "@playwright/test": "^1.49.0" }
}
```

`tests/playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: [
    {
      command: "FAKE_PROVIDER=1 pnpm --filter api dev",
      url: "http://localhost:4000/api/v1/health",
      reuseExistingServer: true,
      timeout: 120_000,
      env: { FAKE_PROVIDER: "1", DATABASE_PATH: "./data/e2e.db" },
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
```
(The API must run with `FAKE_PROVIDER=1` so the scripted sequence in `createProvider()` (Task 7) drives the E2E deterministically; the web app needs `NEXT_PUBLIC_API_URL=http://localhost:4000` in its env. The API applies its sqlite migrations at boot and writes to `./data/e2e.db` — no Docker anywhere.)

- [ ] **Step 2: Run E2E with FakeProvider**

Run: `pnpm test:e2e`
Expected: PASS — idea → brief → script with scores, no console errors. (Playwright boots both servers itself via the `webServer` array; the API runs with `FAKE_PROVIDER=1`.)

- [ ] **Step 3: Full gate**

Run: `pnpm typecheck && pnpm test && pnpm test:e2e`
Expected: all PASS. Then start `pnpm dev` and open `http://localhost:3000` — verify the dashboard renders, create a project, and confirm the workspace stepper shows and approves flow without console/page errors (per definition of done).

- [ ] **Step 4: Update docs status + commit**

- Mark the slice spec `Implemented` in `docs/specs/README.md` and `docs/README.md`.
- Commit: `git add -A && git commit -m "chore: vertical slice implemented and verified"`
