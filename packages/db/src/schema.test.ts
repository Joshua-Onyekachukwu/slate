import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import Database from "better-sqlite3";
import { projects, scripts } from "./schema";

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
});
