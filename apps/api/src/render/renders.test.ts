// MUST precede the @slate/db import: pins this file's Postgres TEST database.
import "../test/api-db";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildApp } from "../app";
import { FakeProvider } from "@slate/ai";
import { ensureDatabase, runMigrations } from "@slate/db";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { createRenderer } from "./renderer";

const TEST_URL = process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate_test_api";

// Reuse the api suite's fixtures + helpers (same queue shape: research gate →
// script → approve → consistency + storyboard gate; storyboard approve reaches
// stage done with NO further provider calls).
const BRIEF = '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}';
const RESEARCH = '{"timeline":["13.8 bya: Big Bang"],"concepts":[],"terminology":{},"references":["NASA"],"keyEvents":[]}';
const SCRIPT = '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}';
const SCORES_HIGH = '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}';
const SCENE = { title: "The Bang", narration: "Thirteen point eight billion years.", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" };
const PACK = { imagePrompt: "i", videoPrompt: "v", narrationPrompt: "n", musicPrompt: "m", sfxPrompt: "s" };
const CHARACTERS = '[{"id":"char-1","name":"The Narrator","description":"A calm voice"}]';
const LOCATIONS = '[{"id":"loc-1","name":"The Universe","description":"Vast"}]';
const CONSISTENCY = [
  { content: CHARACTERS },
  { content: LOCATIONS },
];
const STORY_PASS = (n = 2) => [
  ...CONSISTENCY,
  { content: JSON.stringify(Array.from({ length: n }, (_, i) => ({ ...SCENE, title: `SC ${i + 1}` }))) },
  { content: JSON.stringify(Array.from({ length: n }, (_, i) => ({ ...SCENE, title: `SC ${i + 1}` }))) },
  ...Array.from({ length: n }, () => ({ content: JSON.stringify(PACK) })),
];
const TO_DONE = [
  { content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH },
  ...STORY_PASS(2),
];

// Fake ffmpeg runner: records argv, touches the output file (last arg) so the
// pipeline's later steps find it. Probe reports the binary available.
function fakeRun(log: string[][]) {
  return async (args: string[], opts: { cwd?: string }) => {
    log.push(args);
    const out = args[args.length - 1];
    const target = join(opts.cwd ?? ".", out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "fake-media", { flag: "a" });
    return { code: 0, stdout: "", stderr: "" };
  };
}

describe("render routes", () => {
  let checkpointer: PostgresSaver;
  let rendersDir: string;
  beforeAll(async () => {
    await ensureDatabase(TEST_URL);
    await runMigrations();
    checkpointer = PostgresSaver.fromConnString(TEST_URL);
    await checkpointer.setup();
  });
  afterAll(async () => { await checkpointer.end(); });

  // Drive a project to the locked plan (stage done) with the scripted queue.
  async function driveToDone(app: ReturnType<typeof buildApp>, idea = "render me") {
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea } });
    expect(created.statusCode).toBe(201);
    const pid = created.json().project.id as string;
    const research = await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/research/approve`, payload: { approved: true } });
    expect(research.statusCode).toBe(200);
    const script = await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/script/approve`, payload: { approved: true } });
    expect(script.json().project.stage).toBe("storyboard");
    const done = await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/stages/storyboard/approve`, payload: { approved: true } });
    expect(done.json().project.stage).toBe("done");
    return pid;
  }

  it("409s when the production plan is not locked yet", async () => {
    const app = buildApp({
      provider: new FakeProvider([{ content: BRIEF }, { content: RESEARCH }, { content: SCRIPT }, { content: SCORES_HIGH }]),
      checkpointer,
    });
    const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "not locked" } });
    const pid = created.json().project.id as string;
    const res = await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/render` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("renders a locked project → 201 with mp4/thumbnail/package urls + files on disk", async () => {
    const log: string[][] = [];
    rendersDir = mkdtempSync(join(tmpdir(), "slate-renders-route-"));
    const app = buildApp({
      provider: new FakeProvider(TO_DONE),
      checkpointer,
      renderer: createRenderer({ rendersDir, run: fakeRun(log), probe: async () => true }),
    });
    try {
      const pid = await driveToDone(app);
      const res = await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/render` });
      expect(res.statusCode).toBe(201);
      const render = res.json().render;
      expect(render.status).toBe("ready");
      expect(render.mp4Url).toBe(`/api/v1/renders/${pid}/${render.id}/out.mp4`);
      expect(render.thumbnailUrl).toContain("thumbnail.png");
      expect(render.packageUrl).toContain("slate-render.zip");
      expect(render.meta.scenes).toBe(2);

      // The pipeline actually ran into the render dir and produced the package.
      const outDir = join(rendersDir, pid, render.id);
      for (const f of ["out.mp4", "thumbnail.png", "captions.srt", "manifest.json", "slate-render.zip"]) {
        expect(existsSync(join(outDir, f)), f).toBe(true);
      }
      const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
      expect(manifest.scenes.map((s: { order: number }) => s.order)).toEqual([1, 2]);
      expect(manifest.scenes[0].title).toBe("SC 1");

      // List endpoint shows the render for the owner.
      const list = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}/renders` });
      expect(list.statusCode).toBe(200);
      expect(list.json().renders).toHaveLength(1);

      // The static file route serves the MP4 (content-type + body).
      const mp4 = await app.inject({ method: "GET", url: render.mp4Url });
      expect(mp4.statusCode).toBe(200);
      expect(mp4.headers["content-type"]).toContain("video/mp4");
      expect(mp4.body.length).toBeGreaterThan(0);
    } finally {
      rmSync(rendersDir, { recursive: true, force: true });
    }
  });

  it("auto-narrates scenes lacking voice assets through deps.voice at render", async () => {
    const log: string[][] = [];
    const narrated: { text: string; style?: string }[] = [];
    rendersDir = mkdtempSync(join(tmpdir(), "slate-renders-voice-"));
    const app = buildApp({
      provider: new FakeProvider(TO_DONE),
      checkpointer,
      voice: {
        name: "test-voice",
        async generateVoiceover(input: { text: string; style?: string }) {
          narrated.push(input);
          return { url: `data:audio/mpeg;base64,${Buffer.from(input.text).toString("base64")}`, mimeType: "audio/mpeg" };
        },
      },
      renderer: createRenderer({ rendersDir, run: fakeRun(log), probe: async () => true }),
    });
    try {
      const pid = await driveToDone(app);
      const res = await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/render` });
      expect(res.statusCode).toBe(201);

      // Both scenes synthesized through the voice backend with their narration text.
      expect(narrated).toHaveLength(2);
      expect(narrated[0].text).toBe(SCENE.narration);

      // The mix consumed the materialized clips at their scene offsets (scene 1
      // is 8s, so scene 2's line starts at 8s - not stacked at t=0).
      const mix = log.find((a) => a.some((x) => x === "audio.m4a"))!;
      const fc = mix.join(" ");
      expect(fc).toContain("-i assets/scene1-voice.mp3");
      expect(fc).toContain("-i assets/scene2-voice.mp3");
      expect(fc).toContain("adelay=0:all=1");
      expect(fc).toContain("adelay=8000:all=1");
      expect(fc).toContain("sidechaincompress");
    } finally {
      rmSync(rendersDir, { recursive: true, force: true });
    }
  });

  it("501s with RENDER_UNAVAILABLE and a persisted failed row when ffmpeg is missing", async () => {
    rendersDir = mkdtempSync(join(tmpdir(), "slate-renders-nofm-"));
    const app = buildApp({
      provider: new FakeProvider(TO_DONE),
      checkpointer,
      renderer: createRenderer({ rendersDir, run: fakeRun([]), probe: async () => false }),
    });
    try {
      const pid = await driveToDone(app);
      const res = await app.inject({ method: "POST", url: `/api/v1/projects/${pid}/render` });
      expect(res.statusCode).toBe(501);
      expect(res.json().error.code).toBe("RENDER_UNAVAILABLE");
      expect(res.json().error.details.render.status).toBe("failed");
      const list = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}/renders` });
      expect(list.json().renders[0].status).toBe("failed");
      expect(list.json().renders[0].error).toContain("ffmpeg");
    } finally {
      rmSync(rendersDir, { recursive: true, force: true });
    }
  });

  it("404s on an unknown project and rejects path-traversal file names", async () => {
    rendersDir = mkdtempSync(join(tmpdir(), "slate-renders-trav-"));
    const app = buildApp({
      provider: new FakeProvider([{ content: BRIEF }, { content: RESEARCH }]), // one project create (brief + researchAgent)
      checkpointer,
      renderer: createRenderer({ rendersDir, run: fakeRun([]), probe: async () => true }),
    });
    try {
      const missing = await app.inject({ method: "POST", url: "/api/v1/projects/00000000-0000-0000-0000-000000000000/render" });
      expect(missing.statusCode).toBe(404);

      // The file guard only runs for OWNED projects (owner check is first), so
      // create one to exercise it.
      const created = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { idea: "traversal" } });
      const pid = created.json().project.id as string;

      // A render id + file that don't exist → 404.
      const nf = await app.inject({ method: "GET", url: `/api/v1/renders/${pid}/00000000-0000-0000-0000-000000000000/out.mp4` });
      expect(nf.statusCode).toBe(404);

      // Traversal attempts never serve content. %2F-encoded forms reach the
      // handler and 400 on the file-name guard (the decoded value fails
      // FILE_RE); a lone %2E%2E is normalized by fastify's router to ".." and
      // rejected before the handler (404) - safe either way, never a file.
      const evil = await app.inject({ method: "GET", url: `/api/v1/renders/${pid}/00000000-0000-0000-0000-000000000000/..%2F..%2Fmanifest.json` });
      expect(evil.statusCode).toBe(400);
      expect(evil.json().error.code).toBe("VALIDATION_ERROR");
      const evilNested = await app.inject({ method: "GET", url: `/api/v1/renders/${pid}/00000000-0000-0000-0000-000000000000/%2E%2E%2F%2E%2E` });
      expect(evilNested.statusCode).toBe(400);
      const evilDot = await app.inject({ method: "GET", url: `/api/v1/renders/${pid}/00000000-0000-0000-0000-000000000000/%2E%2E` });
      expect(evilDot.statusCode).toBe(404);
    } finally {
      rmSync(rendersDir, { recursive: true, force: true });
    }
  });
});
