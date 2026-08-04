import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
import { resolveDatabasePath } from "./path";

// Repo-root data/slate.db by default (matches .env.example and drizzle.config.ts)
// regardless of the caller's cwd — the API boots from apps/api, drizzle-kit from packages/db.
const path = resolveDatabasePath(process.env.DATABASE_PATH);
// data/ is gitignored — a fresh checkout has no dir, so better-sqlite3 would throw
// "directory does not exist". Create it (also hardens the API boot on first run).
mkdirSync(dirname(path), { recursive: true });

const sqlite = new Database(path);
// WAL so the LangGraph checkpointer (same file) and drizzle reads don't block each other.
sqlite.pragma("journal_mode = WAL");
// FK enforcement is OFF by default per SQLite connection — without this the
// scripts.project_id FK is decorative and orphan rows silently insert.
sqlite.pragma("foreign_keys = ON");
export const db = drizzle(sqlite, { schema });
export { sqlite };
