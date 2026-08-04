import { fileURLToPath } from "node:url";

// Single source of truth for the default SQLite file. Resolved from THIS module
// (packages/db/src) up to the repo root so every consumer — client, migrate,
// drizzle-kit — points at the same file regardless of their own cwd.
export const DEFAULT_DATABASE_PATH = fileURLToPath(new URL("../../../data/slate.db", import.meta.url));

export function resolveDatabasePath(env?: string): string {
  return env ?? DEFAULT_DATABASE_PATH;
}
