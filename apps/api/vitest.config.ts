import { defineConfig } from "vitest/config";

export default defineConfig({
  // NO global test.env here. Each api test file pins its own Postgres TEST
  // database via a side-effect import (src/test/*-db.ts) BEFORE importing
  // @slate/db — the client validates DATABASE_URL at module load. Each suite
  // gets a hermetic DB (slate_test_api / slate_test_auth) so parallel vitest
  // workers never contend, and neither shares a database with the db schema
  // suite (which DROPs tables) or the E2E boot.
  //
  // 5s was too tight for the FIRST full-graph run in a file (create project →
  // research gate: PostgresSaver + provider calls) on a loaded dev machine —
  // it flakes at ~6.4s under load while passing comfortably in CI. 15s keeps
  // the gate honest without masking genuine hangs.
  test: { testTimeout: 15000 },
});
