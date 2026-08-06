import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pg entirely so the pool test asserts construction WITHOUT a network
// connection — the contract is "lazy pool from the URL", not "connect now".
const poolCtor = vi.hoisted(() => vi.fn());
vi.mock("pg", () => ({ default: { Pool: poolCtor } }));

import { resolveDatabaseUrl, createPgPool } from "./pg";

const NEON_URL =
  "postgresql://slate:secret@ep-cool-widget-123456-pooler.us-east-1.aws.neon.tech/slate?sslmode=require";
const LOCAL_URL = "postgres://slate:slate@localhost:5432/slate";

describe("DATABASE_URL contract (Phase 1+2, ADR-011/013)", () => {
  beforeEach(() => poolCtor.mockClear());

  it("fails loudly when DATABASE_URL is missing", () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => resolveDatabaseUrl()).toThrow(/DATABASE_URL/);
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  it("reads the URL from the environment when none is passed", () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = LOCAL_URL;
    try {
      expect(resolveDatabaseUrl()).toBe(LOCAL_URL);
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  it("accepts a Neon pooled connection string (sslmode=require)", () => {
    expect(resolveDatabaseUrl(NEON_URL)).toBe(NEON_URL);
  });

  it("accepts the local Docker Compose URL", () => {
    expect(resolveDatabaseUrl(LOCAL_URL)).toBe(LOCAL_URL);
  });

  it("rejects a non-postgres scheme with a clear error", () => {
    expect(() => resolveDatabaseUrl("sqlite:./data/slate.db")).toThrow(/postgres/i);
    expect(() => resolveDatabaseUrl("mysql://root@localhost/db")).toThrow(/postgres/i);
  });

  it("rejects a host-less URL", () => {
    expect(() => resolveDatabaseUrl("postgres://")).toThrow(/host/i);
  });

  it("trims trailing whitespace (common .env newline leak)", () => {
    expect(resolveDatabaseUrl(LOCAL_URL + "\n")).toBe(LOCAL_URL);
  });

  it("builds a lazy pg.Pool from the URL — no connection is opened", () => {
    const pool = createPgPool(LOCAL_URL);
    expect(poolCtor).toHaveBeenCalledWith({ connectionString: LOCAL_URL });
    expect(pool).toBeDefined();
  });

  it("createPgPool with no arg resolves DATABASE_URL itself", () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = NEON_URL;
    try {
      createPgPool();
      expect(poolCtor).toHaveBeenCalledWith({ connectionString: NEON_URL });
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });
});
