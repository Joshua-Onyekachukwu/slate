import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { resolveDatabasePath } from "./path";

// Repo-root data/slate.db by default (matches .env.example and drizzle.config.ts)
// regardless of the caller's cwd — the API boots from apps/api, drizzle-kit from packages/db.
const path = resolveDatabasePath(process.env.DATABASE_PATH);

const sqlite = new Database(path);
// WAL so the LangGraph checkpointer (same file) and drizzle reads don't block each other.
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite, { schema });
export { sqlite };
