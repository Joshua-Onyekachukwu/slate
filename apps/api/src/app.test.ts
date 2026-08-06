// MUST precede the @slate/db import: pins this file's Postgres TEST database
// (the client validates DATABASE_URL at module load).
import "./test/api-db";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app";
import { FakeProvider } from "@slate/ai";
import { ensureDatabase, runMigrations } from "@slate/db";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const TEST_URL = process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate_test_api";

const BRIEF = '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}';
const RESEARCH = '{"timeline":["13.8 bya: Big Bang"],"concepts":["cosmic inflation"],"terminology":{},"references":["NASA"],"keyEvents":["First stars ignite"]}';
const RESEARCH_V2 = '{"timeline":["13.8 bya: Big Bang","4.5 bya: Earth forms"],"concepts":["cosmic inflation"],"terminology":{},"references":["NASA","ESA"],"keyEvents":["First stars ignite"]}';
const SCRIPT = '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}';
const SCORES_HIGH = '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}';
const SCORES_LOW = '{"clarity":2,"pacing":2,"engagement":2,"retention":2,"redundancy":2,"notes":["weak hook"],"overall":2}';
const SCENE = { title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" };
const PACK = { imagePrompt: "i", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" };
const CHARACTERS = '[{"id":"char-1","name":"The Narrator","description":"A calm voice"}]';
const LOCATIONS = '[{"id":"loc-1","name":"The Universe","description":"Vast"}]';
// A script APPROVE costs 2 + 2 + n provider calls: consistency first
// (characterAgent + environmentAgent), then storyboardAgent, editorAgent, and
// promptAgent ONCE PER SCENE (each returns a single PromptPack object).
const CONSISTENCY = [
  { content: CHARACTERS }, // characterAgent
  { content: LOCATIONS },  // environmentAgent
];
const STORY_PASS = (n = 2) => [
  ...CONSISTENCY,
  { content: JSON.stringify(Array.from({ length: n }, (_, i) => ({ ...SCENE, title: `SC ${i + 1}` }))) }, // storyboardAgent
  { content: JSON.stringify(Array.from({ length: n }, (_, i) => ({ ...SCENE, title: `SC ${i + 1}` }))) }, // editorAgent
  ...Array.from({ length: n }, () => ({ content: JSON.stringify(PACK) })),                                 // promptAgent ×n
];

// Fresh UUIDs per project keep tests hermetic WITHOUT rmSync-ing the db file:
// @slate/db opens it at module scope, and on Windows an open better-sqlite3
// handle makes rmSync throw EPERM (we hit this in the Task 6 tests).
describe("api", () => {
  let checkpointer: PostgresSaver;
  beforeAll(async () => {
    await ensureDatabase(TEST_URL); // hermetic per-suite DB (slate_test_api)
    await runMigrations(); // idempotent (drizzle journal tracks applied runs)
    checkpointer = PostgresSaver.fromConnString(TEST_URL);
    await checkpointer.setup();
  });
  afterAll(async () => { await checkpointer.end(); });

  it("creates a project → pauses at the research gate → approve → script gate", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH },
    ]), checkpointer });
    const res = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc about the universe" } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.project.id).toBeTruthy();
    // project.stage comes from the workflow CHECKPOINT (research at the gate),
    // NOT the projects column — per the api-design contract.
    expect(body.project.stage).toBe("research");

    // Research stage view: awaiting review with the packet.
    const view = await app.inject({ method: "GET", url: `/api/v1/projects/${body.project.id}/stages/research` });
    expect(view.json().stage.status).toBe("awaiting_review");
    expect(view.json().stage.gate.value).toBe("research_review");
    expect(view.json().content.research.timeline[0]).toContain("Big Bang");

    // Approve research → script + review → script gate.
    const approved = await app.inject({
      method: "POST", url: `/api/v1/projects/${body.project.id}/stages/research/approve`,
      payload: { approved: true },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().project.stage).toBe("script_review");
    expect(approved.json().stage.status).toBe("approved");
  });

  it("returns a single error shape on validation failure", async () => {
    const app = buildApp({ provider: new FakeProvider([]), checkpointer });
    const res = await app.inject({ method: "POST", url: "/api/v1/projects", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("approves the script → storyboard generated → approve → stage done", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });

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

  it("returns the consolidated production plan after the storyboard gate approves", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/storyboard/approve`, payload: { approved: true } });

    const res = await app.inject({ method: "GET", url: `/api/v1/projects/${id}/production-plan` });
    expect(res.statusCode).toBe(200);
    const plan = res.json().plan;
    // Consolidated view per the Task 10 contract: stage + status + script +
    // scenes + the consistency records (characters/locations) in one payload.
    expect(plan.stage).toBe("done");
    expect(plan.productionPlanStatus).toBe("ready");
    expect(plan.script.title).toBe("T");
    expect(plan.scenes).toHaveLength(2);
    expect(plan.characters[0].name).toBe("The Narrator");
    expect(plan.locations[0].name).toBe("The Universe");
  });

  it("returns 409 CONFLICT when approving a stage with no pending interrupt", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/storyboard/approve`, payload: { approved: true } });
    // Already done — no pending interrupt for the storyboard gate anymore.
    const res = await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/storyboard/approve`, payload: { approved: true } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("regenerates the script with feedback → new version, pauses again at the gate", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_LOW }, // pass 1: low scores
      { content: SCRIPT }, { content: SCORES_HIGH },                    // pass 2: regenerated
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });

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
    // Regression guard: @fastify/cors@11 defaults methods to 'GET,HEAD,POST',
    // which CORS-blocks every PUT (reorder, scene edits) in the browser with
    // "Method PUT is not allowed by Access-Control-Allow-Methods".
    const preflight = await app.inject({
      method: "OPTIONS", url: "/api/v1/projects/x/scenes/y",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "PUT" },
    });
    expect(String(preflight.headers["access-control-allow-methods"] ?? "")).toContain("PUT");
  });

  it("reorders scenes atomically → new version rows carry content + prompt packs", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
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
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
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
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH },
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    const list = await app.inject({ method: "GET", url: "/api/v1/projects" });
    const row = (list.json().projects as { id: string; stage: string }[]).find((p) => p.id === id);
    expect(row?.stage).toBe("research"); // checkpoint (research gate), not the column's "brief"
  });

  it("edits a scene → new storyboard version with the edit, order + other scenes preserved, packs carried", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });

    const before = (await app.inject({ method: "GET", url: `/api/v1/projects/${id}/storyboard` })).json().storyboard;
    expect(before.version).toBe(1);
    expect(before.scenes).toHaveLength(2);
    const target = before.scenes[0];
    const other = before.scenes[1];

    const edited = { ...target.content, narration: "user edit: the bang was loud", durationSeconds: 99 };
    const res = await app.inject({
      method: "PUT", url: `/api/v1/projects/${id}/scenes/${target.id}`,
      payload: { content: edited },
    });
    expect(res.statusCode).toBe(200);
    const after = res.json().storyboard;
    expect(after.version).toBe(2); // edit bumps the storyboard version (version-rows model)
    expect(after.scenes).toHaveLength(2);
    // Order preserved; the edited scene (by order) has the new content.
    expect(after.scenes.map((s: { order: number }) => s.order)).toEqual([1, 2]);
    const editedRow = after.scenes.find((s: { order: number }) => s.order === target.order);
    expect(editedRow.content.narration).toBe("user edit: the bang was loud");
    expect(editedRow.content.durationSeconds).toBe(99);
    // Other scenes untouched; packs carried EXCEPT the edited scene's — its
    // content changed, so the pack is nulled ("Prompt pack queued." in the UI)
    // until the prompts/regenerate endpoint re-creates it.
    const otherRow = after.scenes.find((s: { order: number }) => s.order === other.order);
    expect(otherRow.content.title).toBe(other.content.title);
    expect(otherRow.content.narration).toBe(other.content.narration);
    expect(otherRow.promptPack).not.toBeNull();
    expect(editedRow.promptPack).toBeNull();

    // Persists on re-read, and the OLD scene id is gone (new version rows = new ids).
    const reRead = (await app.inject({ method: "GET", url: `/api/v1/projects/${id}/storyboard` })).json().storyboard;
    expect(reRead.version).toBe(2);
    const stale = await app.inject({
      method: "PUT", url: `/api/v1/projects/${id}/scenes/${target.id}`,
      payload: { content: target.content },
    });
    expect(stale.statusCode).toBe(404); // a scene from an old storyboard version
  });

  it("rejects an invalid scene edit with 400 VALIDATION_ERROR", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });
    const sb = (await app.inject({ method: "GET", url: `/api/v1/projects/${id}/storyboard` })).json().storyboard;

    const res = await app.inject({
      method: "PUT", url: `/api/v1/projects/${id}/scenes/${sb.scenes[0].id}`,
      payload: { content: { title: "no narration" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("409s a scene edit before the storyboard exists; 404s a made-up scene", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    // Still at the script gate — no storyboard yet.
    const early = await app.inject({
      method: "PUT", url: `/api/v1/projects/${id}/scenes/nope`,
      payload: { content: { title: "x" } },
    });
    expect(early.statusCode).toBe(409);

    // With a storyboard, a scene id that doesn't exist → 404.
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });
    const madeUp = await app.inject({
      method: "PUT", url: `/api/v1/projects/${id}/scenes/not-a-real-scene`,
      payload: { content: { title: "x" } },
    });
    expect(madeUp.statusCode).toBe(404);
  });

  it("regenerates a scene's prompt pack → new storyboard version with the fresh pack, others preserved", async () => {
    const REGEN_PACK = { imagePrompt: "regenerated i", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" };
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
      { content: JSON.stringify(REGEN_PACK) }, // promptAgent for the regenerate call
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });

    const before = (await app.inject({ method: "GET", url: `/api/v1/projects/${id}/storyboard` })).json().storyboard;
    const target = before.scenes[0];
    const other = before.scenes[1];
    expect(before.version).toBe(1);

    const res = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/scenes/${target.id}/prompts/regenerate`,
    });
    expect(res.statusCode).toBe(200);
    const after = res.json().storyboard;
    expect(after.version).toBe(2); // whole-storyboard version bump (version-rows model)
    expect(after.scenes).toHaveLength(2);
    const regenRow = after.scenes.find((s: { order: number }) => s.order === target.order);
    expect(regenRow.promptPack.imagePrompt).toBe("regenerated i"); // fresh pack from promptAgent
    expect(regenRow.content.title).toBe(target.content.title); // content untouched
    const otherRow = after.scenes.find((s: { order: number }) => s.order === other.order);
    expect(otherRow.promptPack).not.toBeNull(); // other scenes' packs carried
    expect(otherRow.promptPack.imagePrompt).toBe("i");
  });

  it("regenerating a pack fills an edited scene's nulled pack (edit → regenerate round-trip)", async () => {
    const REGEN_PACK = { imagePrompt: "refilled after edit", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" };
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
      { content: JSON.stringify(REGEN_PACK) }, // promptAgent for the regenerate call
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });

    // Edit scene 1 → its pack is nulled (content changed).
    const before = (await app.inject({ method: "GET", url: `/api/v1/projects/${id}/storyboard` })).json().storyboard;
    const target = before.scenes[0];
    const edited = { ...target.content, narration: "edited narration" };
    const editRes = await app.inject({
      method: "PUT", url: `/api/v1/projects/${id}/scenes/${target.id}`,
      payload: { content: edited },
    });
    const afterEdit = editRes.json().storyboard;
    const editedRow = afterEdit.scenes.find((s: { order: number }) => s.order === target.order);
    expect(editedRow.promptPack).toBeNull(); // "Prompt pack queued." in the UI

    // Regenerate just that scene's pack → the new row carries the fresh pack.
    const res = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/scenes/${editedRow.id}/prompts/regenerate`,
    });
    expect(res.statusCode).toBe(200);
    const after = res.json().storyboard;
    const regenRow = after.scenes.find((s: { order: number }) => s.order === target.order);
    expect(regenRow.promptPack.imagePrompt).toBe("refilled after edit");
    expect(regenRow.content.narration).toBe("edited narration"); // edit survived
  });

  it("404s prompt regeneration for a missing project (owner-gated route)", async () => {
    const app = buildApp({ provider: new FakeProvider([]), checkpointer });
    const res = await app.inject({
      method: "POST", url: "/api/v1/projects/nope/scenes/x/prompts/regenerate",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("regenerates the research with feedback → new packet at the gate → approve → script gate", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: RESEARCH_V2 }, // research v2 after feedback
      { content: SCRIPT }, { content: SCORES_HIGH },
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;

    // Reject with feedback → research regenerates → new packet at the gate.
    const regen = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/stages/research/regenerate`,
      payload: { feedback: "add sources" },
    });
    expect(regen.statusCode).toBe(200);
    expect(regen.json().stage.status).toBe("awaiting_review");
    expect(regen.json().stage.gate.value).toBe("research_review");
    const view = await app.inject({ method: "GET", url: `/api/v1/projects/${id}/stages/research` });
    expect(view.json().content.research.timeline[1]).toContain("Earth forms"); // v2 persisted on the project

    // Approve → script + review → script gate.
    const approved = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`,
      payload: { approved: true },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().project.stage).toBe("script_review");
  });

  it("409s research approve once the research gate has already been passed", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH },
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    // Already past the research gate — no pending interrupt anymore.
    const res = await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("409s prompt regeneration before the storyboard exists; 404s a made-up scene", async () => {
    const app = buildApp({ provider: new FakeProvider([
      { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }, ...STORY_PASS(),
    ]), checkpointer });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "doc" } });
    const id = created.json().project.id as string;
    // No storyboard yet → 409.
    const early = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/scenes/nope/prompts/regenerate`,
    });
    expect(early.statusCode).toBe(409);

    // With a storyboard, a scene id that doesn't exist → 404.
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/research/approve`, payload: { approved: true } });
    await app.inject({ method: "POST", url: `/api/v1/projects/${id}/stages/script/approve`, payload: { approved: true } });
    const madeUp = await app.inject({
      method: "POST", url: `/api/v1/projects/${id}/scenes/not-a-real-scene/prompts/regenerate`,
    });
    expect(madeUp.statusCode).toBe(404);
  });
});
