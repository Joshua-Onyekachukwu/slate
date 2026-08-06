// Side-effect import: pins the SQLite file for THIS test file BEFORE @slate/db
// loads — its client opens the db from process.env.DATABASE_PATH at module
// load (packages/db/src/client.ts). Must be the FIRST import in the test file.
//
// Keeps auth.test.ts on its own file (test-auth.db) so parallel vitest workers
// never contend with app.test.ts's test-api.db (SQLITE_BUSY on CI).
process.env.DATABASE_PATH = "./data/test-auth.db";
