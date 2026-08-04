import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { projects, scripts, storyboards, scenes } from "./schema";

const TEST_URL = process.env.DATABASE_URL ?? "postgres://videogen:videogen@localhost:5432/videogen";

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
    expect(got[0].ownerId).toBe(uid); // required (ADR-023) — drizzle maps owner_id → ownerId
    expect(got[0].stage).toBe("discovery");
  });

  it("rejects a project without an owner", async () => {
    const db = drizzle(pool);
    // Cast: Drizzle's TS types forbid omitting ownerId — we assert the DB enforces NOT NULL at runtime.
    await expect(db.insert(projects).values({ id: crypto.randomUUID(), idea: "x" } as any))
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
