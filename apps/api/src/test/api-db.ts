// Side-effect import: pins the SQLite file for THIS test file BEFORE @slate/db
// loads — its client opens the db from process.env.DATABASE_PATH at module
// load (packages/db/src/client.ts). Must be the FIRST import in the test file.
//
// Why: a single global DATABASE_PATH in vitest.config made app.test.ts and
// auth.test.ts open ONE file from parallel vitest workers → SQLITE_BUSY on CI
// (run 31084827536, "database is locked" at the WAL pragma). Each api test
// file now pins its own db and is immune to ambient env.
process.env.DATABASE_PATH = "./data/test-api.db";
