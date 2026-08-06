// Playwright runs globalSetup BEFORE the webServer array boots, so the API's
// Postgres boot (ensureDatabase + runMigrations + PostgresSaver) has its own
// hermetic DB to create tables in. Must match playwright.config.ts's
// DATABASE_URL for the api webServer exactly.
const E2E_URL = process.env.E2E_DATABASE_URL ?? "postgres://slate:slate@localhost:5432/slate_test_e2e";

export default async function globalSetup() {
  // Dynamic import: @slate/db's client validates DATABASE_URL at MODULE LOAD,
  // and this process (Playwright's globalSetup) has no DATABASE_URL set — it's
  // only defined on the webServer env. Import lazily so the load-time check
  // never fires before we point the module at the E2E database.
  process.env.DATABASE_URL = E2E_URL;
  const { ensureDatabase } = await import("@slate/db");
  await ensureDatabase(E2E_URL);
  // The API's index.ts runs runMigrations() + PostgresSaver.setup() on boot,
  // so no migration work is needed here — just make sure the DB exists.
}
