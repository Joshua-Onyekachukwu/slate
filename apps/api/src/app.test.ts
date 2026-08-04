import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app";
import { FakeProvider } from "@slate/ai";
import { runMigrations } from "@slate/db";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

const TEST_PATH = process.env.DATABASE_PATH ?? "./data/test-api.db";

const BRIEF = '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}';
const SCRIPT = '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}';
const SCORES_HIGH = '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}';
const SCORES_LOW = '{"clarity":2,"pacing":2,"engagement":2,"retention":2,"redundancy":2,"notes":["weak hook"],"overall":2}';

// Fresh UUIDs per project keep tests hermetic WITHOUT rmSync-ing the db file:
// @slate/db opens it at module scope, and on Windows an open better-sqlite3
// handle makes rmSync throw EPERM (we hit this in the Task 6 tests).
describe("api", () => {
  let checkpointer: SqliteSaver;
  beforeAll(async () => {
    await runMigrations(); // idempotent (drizzle journal tracks applied runs)
    checkpointer = SqliteSaver.fromConnString(TEST_PATH);
  });
  afterAll(() => { checkpointer.db.close(); });

  it("creates a project and runs discovery to the script gate", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: SCRIPT }, { content: SCORES_HIGH },
    ]), checkpointer });
    const res = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc about the universe" } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.project.id).toBeTruthy();
    // project.stage comes from the workflow CHECKPOINT (script_review at the
    // gate), NOT the projects column — per the api-design contract.
    expect(body.project.stage).toBe("script_review");
  });

  it("returns a single error shape on validation failure", async () => {
    const app = buildApp({ provider: new FakeProvider([]), checkpointer });
    const res = await app.inject({ method: "POST", url: "/api/v1/projects", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("approves the script → stage advances to done", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: SCRIPT }, { content: SCORES_HIGH },
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;

    const res = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`,
      payload: { approved: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.project.stage).toBe("done");
    expect(body.stage.status).toBe("approved");
    expect(body.stage.gate).toBeNull(); // no longer paused at a gate
  });

  it("returns 409 CONFLICT when approving a stage with no pending interrupt", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: SCRIPT }, { content: SCORES_HIGH },
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });
    // Already done — no pending interrupt for the script gate anymore.
    const res = await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("regenerates the script with feedback → new version, pauses again at the gate", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: SCRIPT }, { content: SCORES_LOW }, // pass 1: low scores
      { content: SCRIPT }, { content: SCORES_HIGH },                    // pass 2: regenerated
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;

    const res = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/stages/script/regenerate`,
      payload: { feedback: "fix the hook" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stage.status).toBe("awaiting_review"); // paused again at the gate
    expect(body.stage.version).toBe(2); // regenerate produced a new script version
    expect(body.stage.gate.value).toBe("script_review");
  });

  it("returns 404 NOT_FOUND for a missing project", async () => {
    const app = buildApp({ provider: new FakeProvider([]), checkpointer });
    const res = await app.inject({ method: "GET", url: "/api/v1/projects/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});
