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
const SCENE = { title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" };
const PACK = { imagePrompt: "i", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" };
// The storyboard pass costs 2 + n provider calls: storyboardAgent, editorAgent,
// then promptAgent ONCE PER SCENE (each returns a single PromptPack object).
const STORY_PASS = (n = 2) => [
  { content: JSON.stringify(Array.from({ length: n }, (_, i) => ({ ...SCENE, title: `SC ${i + 1}` }))) }, // storyboardAgent
  { content: JSON.stringify(Array.from({ length: n }, (_, i) => ({ ...SCENE, title: `SC ${i + 1}` }))) }, // editorAgent
  ...Array.from({ length: n }, () => ({ content: JSON.stringify(PACK) })),                                 // promptAgent ×n
];

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

  it("approves the script → storyboard generated → approve → stage done", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;

    const res = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`,
      payload: { approved: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.project.stage).toBe("storyboard"); // checkpoint moved into the storyboard stage
    expect(body.stage.status).toBe("approved"); // the SCRIPT stage view just got approved
    expect(body.stage.gate).toBeNull();

    // The storyboard stage itself is now the one awaiting review.
    const st = await app.inject({ method: "GET", url: `/api/v1/projects/${id}/stages/storyboard` });
    expect(st.json().stage.status).toBe("awaiting_review");
    expect(st.json().stage.gate.value).toBe("storyboard_review");
    expect(st.json().stage.version).toBe(1);
    expect(st.json().content.storyboard.scenes).toHaveLength(2);

    const sb = await app.inject({ method: "GET", url: `/api/v1/projects/${id}/storyboard` });
    expect(sb.statusCode).toBe(200);
    expect(sb.json().storyboard.scenes).toHaveLength(2);
    expect(sb.json().storyboard.scenes[0].promptPack).not.toBeNull();

    // Approve the storyboard → done.
    const done = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/stages/storyboard/approve`,
      payload: { approved: true },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().project.stage).toBe("done");
  });

  it("returns 409 CONFLICT when approving a stage with no pending interrupt", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/storyboard/approve`, payload: { approved: true } });
    // Already done — no pending interrupt for the storyboard gate anymore.
    const res = await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/storyboard/approve`, payload: { approved: true } });
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

  it("allows cross-origin requests from the web app (CORS)", async () => {
    const app = buildApp({ provider: new FakeProvider([]), checkpointer });
    const res = await app.inject({
      method: "GET", url: "/api/v1/health", headers: { origin: "http://localhost:3000" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("reorders scenes atomically → new version rows carry content + prompt packs", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });

    const before = (await app.inject({ method: "GET", url: `/api/v1/projects/${id}/storyboard` })).json().storyboard;
    const ids = before.scenes.map((s: { id: string }) => s.id);
    expect(before.version).toBe(1);

    // Swap the two scenes.
    const res = await app.inject({
      method: "PUT", url: `/api/v1/projects/${id}/storyboard/order`,
      payload: { scene_ids: [ids[1], ids[0]] },
    });
    expect(res.statusCode).toBe(200);
    const after = res.json().storyboard;
    expect(after.version).toBe(2); // reorder bumps the storyboard version
    // New version rows = new ids; the CONTRACT is that content order swapped.
    expect(after.scenes.map((s: { id: string }) => s.id)).not.toEqual(ids);
    expect(after.scenes.map((s: { content: { title: string } }) => s.content.title)).toEqual(["SC 2", "SC 1"]);
    expect(after.scenes[0].promptPack).not.toBeNull(); // pack carried into the new row

    // Not a permutation → 400.
    const bad = await app.inject({
      method: "PUT", url: `/api/v1/projects/${id}/storyboard/order`,
      payload: { scene_ids: [ids[0]] },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("reorders only while at the storyboard gate — 409 before it exists, 404 for missing project", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    // Project exists but has no storyboard yet (still at the script gate).
    const res = await app.inject({
      method: "PUT", url: `/api/v1/projects/${id}/storyboard/order`,
      payload: { scene_ids: [] },
    });
    expect(res.statusCode).toBe(409);
    const missing = await app.inject({
      method: "GET", url: "/api/v1/projects/nope/storyboard",
    });
    expect(missing.statusCode).toBe(404);
  });

  it("lists projects with checkpoint-derived stage (not the stale column)", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: SCRIPT }, { content: SCORES_HIGH },
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    const list = await app.inject({ method: "GET", url: "/api/v1/projects" });
    const row = (list.json().projects as { id: string; stage: string }[]).find((p) => p.id === id);
    expect(row?.stage).toBe("script_review"); // checkpoint, not the column's "brief"
  });
});
