import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { projects, scripts, storyboards, scenes, assets } from "./schema";
import { ensureDatabase } from "./pg";

// Hermetic DB: this suite DROPS all tables (incl. the drizzle journal) in
// afterAll, so it must never share a database with the API tests or the E2E
// boot - each suite gets its own (slate_test_schema / slate_test_api /
// slate_test_auth / slate_test_e2e).
const TEST_URL = process.env.DB_TEST_URL ?? "postgres://slate:slate@localhost:5432/slate_test_schema";

describe("db schema", () => {
  let pool: pg.Pool;
  beforeAll(async () => {
    await ensureDatabase(TEST_URL);
    pool = new pg.Pool({ connectionString: TEST_URL });
    await pool.query(`DROP TABLE IF EXISTS assets, scenes, storyboards, scripts, projects CASCADE`);
    await pool.query(`
      CREATE TABLE projects (
        id uuid PRIMARY KEY,
        owner_id text NOT NULL, -- Clerk user id (user_...) - no local users table (ADR-023)
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
      CREATE TABLE assets (
        id uuid PRIMARY KEY,
        scene_id uuid NOT NULL REFERENCES scenes(id),
        kind text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        url text,
        mime_type text,
        provider text,
        meta jsonb NOT NULL DEFAULT '{}',
        error text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  });
  afterAll(async () => {
    // Restore the DB to pristine: drop the inline tables AND the drizzle journal
    // so a later drizzle-kit migrate re-applies cleanly. Without the journal drop,
    // a migrate-then-test cycle would leave "journal says applied, tables gone"  - 
    // the next migrate would skip and every query would fail with relation missing.
    await pool.query(`DROP TABLE IF EXISTS drizzle.__drizzle_migrations`);
    await pool.query(`DROP TABLE IF EXISTS assets, scenes, storyboards, scripts, projects CASCADE`);
    await pool.end();
  });

  it("round-trips a project owned by a Clerk user", async () => {
    const db = drizzle(pool);
    const uid = "user_abc123"; // Clerk user id (ADR-023)
    const row = { id: crypto.randomUUID(), ownerId: uid, idea: "doc about the universe" };
    await db.insert(projects).values(row);
    const got = await db.select().from(projects).where(sql`id = ${row.id}`);
    expect(got).toHaveLength(1);
    expect(got[0].ownerId).toBe(uid); // required (ADR-023)
    expect(got[0].stage).toBe("discovery");
  });

  it("rejects a project without an owner", async () => {
    // Raw SQL so the constraint is proven at the DB layer: drizzle's TS type
    // already requires ownerId at compile time, so a drizzle-level insert can't
    // reach the DB to prove owner_id NOT NULL actually rejects.
    await expect(
      pool.query(`INSERT INTO projects (id, idea) VALUES ($1, $2)`, [crypto.randomUUID(), "x"]),
    ).rejects.toThrow(); // owner_id NOT NULL
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

  it("round-trips a generated asset and defaults its status", async () => {
    const db = drizzle(pool);
    const pid = crypto.randomUUID();
    await db.insert(projects).values({ id: pid, ownerId: "user_abc123", idea: "x" });
    const sbId = crypto.randomUUID();
    await db.insert(storyboards).values({ id: sbId, projectId: pid, version: 1 });
    const sceneId = crypto.randomUUID();
    await db.insert(scenes).values({
      id: sceneId, storyboardId: sbId, order: 1, version: 1, title: "The Bang",
      content: { title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" },
      promptPack: null,
    });
    const assetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: assetId, sceneId, kind: "image", status: "ready", url: "fake://image/abc.png", mimeType: "image/png", provider: "fake",
    });
    const got = await db.select().from(assets).where(sql`id = ${assetId}`);
    expect(got).toHaveLength(1);
    expect(got[0].kind).toBe("image");
    expect(got[0].status).toBe("ready");
    expect(got[0].url).toBe("fake://image/abc.png");
    expect(got[0].meta).toEqual({}); // jsonb default
    // a second asset WITHOUT a status gets the pending default
    const a2 = crypto.randomUUID();
    await db.insert(assets).values({ id: a2, sceneId, kind: "voice" });
    const [got2] = await db.select().from(assets).where(sql`id = ${a2}`);
    expect(got2.status).toBe("pending");
  });

  it("rejects an asset with an orphan scene id (FK)", async () => {
    await expect(
      pool.query(`INSERT INTO assets (id, scene_id, kind) VALUES ($1, $2, 'image')`, [
        crypto.randomUUID(), crypto.randomUUID(), // no such scene
      ]),
    ).rejects.toThrow(); // FK violation
  });
});
