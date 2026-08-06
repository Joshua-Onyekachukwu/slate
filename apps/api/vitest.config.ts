import { defineConfig } from "vitest/config";

export default defineConfig({
  // NO global test.env here. Each api test file pins its own SQLite file via a
  // side-effect import (src/test/*-db.ts) BEFORE importing @slate/db — the
  // client opens the db from process.env.DATABASE_PATH at module load. One
  // shared DATABASE_PATH made app.test.ts and auth.test.ts open the same file
  // from parallel vitest workers → SQLITE_BUSY on CI (run 31084827536).
});
