import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./client";

// Resolve relative to THIS module, not the caller's cwd (the API boots from apps/api).
const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}
