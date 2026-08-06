// MUST precede the @slate/db import: pins this file's Postgres TEST database
// (the client validates DATABASE_URL at module load).
import "./test/auth-db";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "./app";
import { FakeProvider } from "@slate/ai";
import { ensureDatabase, runMigrations } from "@slate/db";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const TEST_URL = process.env.DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate_test_auth";

const BRIEF = '{"kind":"brief","brief":{"topic":"universe","audience":"general","platform":"youtube","style":"documentary","durationSeconds":270,"tone":"wonder","narration":"male","aspectRatio":"16:9"}}';
const SCRIPT = '{"title":"T","hook":"H","introduction":"I","body":["B1"],"conclusion":"C","cta":null}';
const SCORES_HIGH = '{"clarity":4,"pacing":4,"engagement":4,"retention":4,"redundancy":4,"notes":[],"overall":4}';

// Injectable verifier per the plan's Task 2 contract: maps a bearer token to a
// Clerk user id, so tests never call Clerk. Same shape makeVerifyToken returns.
const fakeVerify = (map: Record<string, string>) => async (token: string) => {
  const userId = map[token];
  if (!userId) throw new Error("invalid token");
  return { userId };
};

describe("auth — Clerk-style multi-user isolation (ADR-022/023)", () => {
  let checkpointer: PostgresSaver;
  beforeAll(async () => {
    await ensureDatabase(TEST_URL); // hermetic per-suite DB (slate_test_auth)
    await runMigrations(); // idempotent (drizzle journal tracks applied runs)
    checkpointer = PostgresSaver.fromConnString(TEST_URL);
    await checkpointer.setup();
  });
  afterAll(async () => { await checkpointer.end(); });

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const appFor = (map: Record<string, string>) =>
    buildApp({
      provider: new FakeProvider([{ content: BRIEF }, { content: SCRIPT }, { content: SCORES_HIGH }]),
      checkpointer,
      verifyToken: fakeVerify(map),
    });

  it("creates an owned project and lists only mine", async () => {
    const app = appFor({ "tok-a": "user_a" });
    const created = await app.inject({
      method: "POST", url: "/api/v1/projects",
      payload: { idea: "doc" }, headers: bearer("tok-a"),
    });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.project.ownerId).toBe("user_a");

    const list = await app.inject({ method: "GET", url: "/api/v1/projects", headers: bearer("tok-a") });
    const mine = (list.json().projects as { id: string; ownerId: string }[]).find((p) => p.id === body.project.id);
    expect(mine?.ownerId).toBe("user_a");
    // Everything in my list belongs to me.
    for (const p of list.json().projects as { ownerId: string }[]) expect(p.ownerId).toBe("user_a");
  });

  it("returns 401 without a valid token (enforced mode)", async () => {
    const app = appFor({});
    const res = await app.inject({ method: "GET", url: "/api/v1/projects" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for a token the verifier rejects", async () => {
    const app = appFor({ "tok-a": "user_a" });
    const res = await app.inject({ method: "GET", url: "/api/v1/projects", headers: bearer("forged") });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 when user B opens user A's project (never 403 — no existence leak)", async () => {
    const app = appFor({ "tok-a": "user_a", "tok-b": "user_b" });
    const created = await app.inject({
      method: "POST", url: "/api/v1/projects",
      payload: { idea: "doc" }, headers: bearer("tok-a"),
    });
    const pid = created.json().project.id as string;

    const res = await app.inject({ method: "GET", url: `/api/v1/projects/${pid}`, headers: bearer("tok-b") });
    expect(res.statusCode).toBe(404);

    // Approve/regenerate paths are owner-gated the same way (no resume on someone else's thread).
    const approve = await app.inject({
      method: "POST", url: `/api/v1/projects/${pid}/stages/script/approve`,
      payload: { approved: true }, headers: bearer("tok-b"),
    });
    expect(approve.statusCode).toBe(404);
  });

  it("does not leak user A's project into user B's list", async () => {
    const app = appFor({ "tok-a": "user_a", "tok-b": "user_b" });
    const created = await app.inject({
      method: "POST", url: "/api/v1/projects",
      payload: { idea: "doc" }, headers: bearer("tok-a"),
    });
    const pid = created.json().project.id as string;

    const list = await app.inject({ method: "GET", url: "/api/v1/projects", headers: bearer("tok-b") });
    const found = (list.json().projects as { id: string }[]).find((p) => p.id === pid);
    expect(found).toBeUndefined();
  });

  it("keeps health public and answers CORS preflight in enforced mode", async () => {
    const app = appFor({ "tok-a": "user_a" });
    // Liveness probes carry no token.
    const health = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(health.statusCode).toBe(200);

    // Preflight (OPTIONS, no Authorization) must be answered by CORS, not 401'd
    // by auth — otherwise cross-origin calls break in enforced mode.
    const preflight = await app.inject({
      method: "OPTIONS", url: "/api/v1/projects",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "GET" },
    });
    expect(preflight.statusCode).not.toBe(401);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});
