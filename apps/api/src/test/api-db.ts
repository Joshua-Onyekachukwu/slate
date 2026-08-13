// Side-effect import: pins the Postgres TEST database for THIS test file BEFORE
// @slate/db loads - its client validates DATABASE_URL at module load
// (packages/db/src/client.ts). Must be the FIRST import in the test file.
//
// Each api test file gets its own hermetic DB (slate_test_api / slate_test_auth)
// so parallel vitest workers never contend, and neither ever shares a database
// with the db schema suite (which DROPs tables) or the E2E boot.
process.env.DATABASE_URL = "postgres://slate:slate@localhost:5432/slate_test_api";
