import pg from "pg";

// Phase 1+2 Postgres contract (ADR-011/013): DATABASE_URL is the single
// connection-string source of truth for Postgres — Docker Compose locally
// (postgres://slate:slate@localhost:5432/slate) or Neon in the cloud
// (postgresql://…-pooler.…neon.tech/db?sslmode=require, see neon skill:
// pooled for the app, direct for migrations).
//
// This module VALIDATES the contract and constructs the pool WITHOUT
// connecting (lazy). The slice's SQLite path (DATABASE_PATH) stays the
// default runtime until Task 4's Drizzle Postgres schema lands; nothing
// calls createPgPool() until then, so booting the API is unaffected.
export function resolveDatabaseUrl(raw?: string): string {
  const url = raw ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required for the Postgres path — set it in .env " +
        "(e.g. postgres://slate:slate@localhost:5432/slate for Docker, or a Neon pooled URL).",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(
      `DATABASE_URL must use the postgres:// or postgresql:// scheme — got ${parsed.protocol}`,
    );
  }
  if (!parsed.hostname) {
    throw new Error(`DATABASE_URL is missing a host — got ${url}`);
  }
  // .env files often carry trailing whitespace/newlines; hand the pool a clean string.
  return url.trim();
}

export function createPgPool(url: string = resolveDatabaseUrl()): pg.Pool {
  return new pg.Pool({ connectionString: url });
}

export type PgPool = pg.Pool;
