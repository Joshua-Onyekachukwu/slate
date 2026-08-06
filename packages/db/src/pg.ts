import pg from "pg";

// Phase 1+2 Postgres contract (ADR-011/013): DATABASE_URL is the single
// connection-string source of truth for Postgres — Docker Compose locally
// (postgres://slate:slate@localhost:5432/slate) or Neon in the cloud
// (postgresql://…-pooler.…neon.tech/db?sslmode=require, see neon skill:
// pooled for the app, direct for migrations).
//
// This module VALIDATES the contract and constructs the pool WITHOUT
// connecting (lazy). Since Task 4/10 the API + worker boot on this pool, so
// a missing/malformed DATABASE_URL fails fast at module load (the pool is
// created eagerly; no connection is opened until the first query).
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

// Create a database on demand if it doesn't exist yet (test suites + E2E each
// get a hermetic DB: slate_test_schema / slate_test_api / slate_test_auth /
// slate_test_e2e). Connects to the always-present `postgres` maintenance DB
// to run CREATE DATABASE — you can't create a database while connected to it.
// Postgres has no CREATE DATABASE IF NOT EXISTS, so check pg_database first.
export async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const dbName = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
  if (!dbName) throw new Error(`DATABASE_URL must name a database: ${url}`);
  const admin = new URL(url);
  admin.pathname = "/postgres"; // maintenance connection; always exists
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (rows.length === 0) {
      // Identifier is validated by URL parsing + the db-name regex below.
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
        throw new Error(`Refusing to CREATE DATABASE with an unsafe name: ${dbName}`);
      }
      await client.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await client.end();
  }
}

export type PgPool = pg.Pool;
