import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import Database from "better-sqlite3";
import { projects, scripts, storyboards, scenes } from "./schema";

describe("db schema", () => {
  let db: ReturnType<typeof drizzle>;
  let conn: InstanceType<typeof Database>;
  beforeAll(() => {
    conn = new Database(":memory:");
    db = drizzle(conn);
    // FK enforcement is off by default per SQLite connection — enable it so the
    // orphan test below proves the constraint actually rejects, not that the
    // connection silently tolerated it.
    conn.pragma("foreign_keys = ON");
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
      CREATE TABLE storyboards (
        id text PRIMARY KEY,
        project_id text NOT NULL REFERENCES projects(id),
        version integer NOT NULL,
        created_at integer NOT NULL DEFAULT (unixepoch()),
        UNIQUE (project_id, version)
      );
      CREATE TABLE scenes (
        id text PRIMARY KEY,
        storyboard_id text NOT NULL REFERENCES storyboards(id),
        "order" integer NOT NULL,
        version integer NOT NULL,
        content text NOT NULL,
        prompt_pack text,
        created_at integer NOT NULL DEFAULT (unixepoch()),
        UNIQUE (storyboard_id, "order", version)
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
    expect(got[0].stage).toBe("discovery"); // default applied
    expect(got[0].conversation).toEqual([]); // json mode round-trips
  });

  it("stores script versions per project and enforces (project_id, version) uniqueness", async () => {
    const projectId = crypto.randomUUID();
    await db.insert(projects).values({ id: projectId, idea: "x" });

    const content = { title: "T", hook: "H", introduction: "I", body: ["B1"], conclusion: "C", cta: null };
    await db.insert(scripts).values({ id: crypto.randomUUID(), projectId, version: 1, content });
    await db.insert(scripts).values({ id: crypto.randomUUID(), projectId, version: 2, content });
    const rows = await db.select().from(scripts).where(sql`project_id = ${projectId}`);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.version)).toEqual([1, 2]); // both versions persist

    await expect(
      db.insert(scripts).values({ id: crypto.randomUUID(), projectId, version: 1, content }),
    ).rejects.toThrow(); // UNIQUE(project_id, version)
  });

  it("stores storyboard versions with per-version scene rows", async () => {
    const projectId = crypto.randomUUID();
    await db.insert(projects).values({ id: projectId, idea: "x" });
    const content = { title: "SC", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" };

    // Storyboard v1 with two scenes.
    const sb1 = crypto.randomUUID();
    await db.insert(storyboards).values({ id: sb1, projectId, version: 1 });
    await db.insert(scenes).values([
      { id: crypto.randomUUID(), storyboardId: sb1, order: 1, version: 1, content },
      { id: crypto.randomUUID(), storyboardId: sb1, order: 2, version: 1, content },
    ]);
    // Storyboard v2 (a reorder) — same orders allowed under a new storyboard version.
    const sb2 = crypto.randomUUID();
    await db.insert(storyboards).values({ id: sb2, projectId, version: 2 });
    await db.insert(scenes).values([
      { id: crypto.randomUUID(), storyboardId: sb2, order: 1, version: 2, content },
      { id: crypto.randomUUID(), storyboardId: sb2, order: 2, version: 2, content },
    ]);
    const rows = await db.select().from(scenes).where(sql`storyboard_id = ${sb1}`);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.version)).toEqual([1, 1]);
    expect(rows.map((r) => r.order)).toEqual([1, 2]);

    await expect(
      db.insert(storyboards).values({ id: crypto.randomUUID(), projectId, version: 1 }),
    ).rejects.toThrow(); // UNIQUE(project_id, version)
    await expect(
      db.insert(scenes).values({ id: crypto.randomUUID(), storyboardId: sb1, order: 1, version: 1, content }),
    ).rejects.toThrow(); // UNIQUE(storyboard_id, order, version)
  });

  it("stores a prompt pack on a scene row and rejects orphan scene inserts (FK)", async () => {
    const projectId = crypto.randomUUID();
    await db.insert(projects).values({ id: projectId, idea: "x" });
    const sb = crypto.randomUUID();
    await db.insert(storyboards).values({ id: sb, projectId, version: 1 });
    const pack = { imagePrompt: "i", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" };
    await db.insert(scenes).values({
      id: crypto.randomUUID(), storyboardId: sb, order: 1, version: 1,
      content: { title: "SC", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" },
      promptPack: pack,
    });
    const rows = await db.select().from(scenes).where(sql`storyboard_id = ${sb}`);
    expect(rows[0].promptPack).toEqual(pack); // json mode round-trips

    // No matching storyboard row — the FK must refuse.
    await expect(
      db.insert(scenes).values({
        id: crypto.randomUUID(), storyboardId: crypto.randomUUID(), order: 1, version: 1,
        content: { title: "SC", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" },
      }),
    ).rejects.toThrow(); // FOREIGN KEY constraint failed
  });

  it("rejects a script whose project_id references a nonexistent project (FK)", async () => {
    const content = { title: "T", hook: "H", introduction: "I", body: ["B1"], conclusion: "C", cta: null };
    // No matching row in projects — the FK must refuse the insert.
    await expect(
      db.insert(scripts).values({ id: crypto.randomUUID(), projectId: crypto.randomUUID(), version: 1, content }),
    ).rejects.toThrow(); // FOREIGN KEY constraint failed

    // Sanity: the same insert with a real project still succeeds.
    const projectId = crypto.randomUUID();
    await db.insert(projects).values({ id: projectId, idea: "x" });
    await expect(
      db.insert(scripts).values({ id: crypto.randomUUID(), projectId, version: 1, content }),
    ).resolves.not.toThrow();
  });
});
