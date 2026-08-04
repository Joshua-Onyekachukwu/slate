import { describe, it, expect } from "vitest";
import { sqlite } from "./client";

// Hardening pass (Task 3): these assert on the REAL production connection
// (client.ts opens resolveDatabasePath() → repo-root data/slate.db at import).
// SQLite's journal_mode and foreign_keys are per-connection pragmas — the
// migration DDL declaring the FK is not enough; enforcement must be enabled
// on every connection that writes.

describe("production sqlite client pragmas", () => {
  it("activates WAL journal mode on the real db file", () => {
    // better-sqlite3 reads the live connection's mode back.
    expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("enables foreign key enforcement", () => {
    // Without this the scripts.project_id FK from the migration is decorative:
    // SQLite silently accepts orphan rows when foreign_keys is off.
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });
});
