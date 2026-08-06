// Side-effect import: pins the Postgres TEST database for THIS test file BEFORE
// @slate/db loads — its client validates DATABASE_URL at module load
// (packages/db/src/client.ts). Must be the FIRST import in the test file.
//
// auth.test.ts gets its own DB (slate_test_auth) so it never contends with
// app.test.ts (slate_test_api) or the db schema suite (which DROPs tables).
process.env.DATABASE_URL = "postgres://slate:slate@localhost:5432/slate_test_auth";
