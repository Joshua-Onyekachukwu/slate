import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // auth.spec.ts is owned by playwright.auth.config.ts (testMatch — boots the
  // stack with STUB_AUTH=1 + fake Clerk keys). Under this main config it would
  // run against the demo-mode stack and fail, so exclude it here.
  testIgnore: /auth\.spec\.ts/,
  // Creates the hermetic E2E database (slate_test_e2e) before the webServer
  // array boots the API — Postgres boot requires the DB to exist. Also swaps
  // the old SQLite boot (DATABASE_PATH) for the Task 10 DATABASE_URL contract.
  globalSetup: "./global-setup.ts",
  // The booted API runs ONE FakeProvider queue shared by every spec file
  // (webServer is config-level). Specs consume deterministic contiguous blocks
  // (see apps/api/src/provider.ts), which requires sequential execution.
  workers: 1,
  // Absorb Next dev's on-demand first compile of the workspace route.
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    // Slow-CI insurance: the first workspace compile can exceed the 5s default.
    expect: { timeout: 15_000 },
  },
  // Playwright boots both servers itself. Env vars go through the `env:` option
  // (cross-platform) — NEVER inline bash syntax (`FAKE_PROVIDER=1 pnpm ...`),
  // which Playwright's cmd.exe spawn can't parse on Windows.
  webServer: [
    {
      command: "pnpm --filter api start",
      url: "http://localhost:4000/api/v1/health",
      // NEVER reuse: a stale server on the port would carry the wrong env/API URL and
      // silently corrupt the run (this env proved that trap with an ambient PORT).
      reuseExistingServer: false,
      timeout: 120_000,
      // PORT must be pinned: the ambient shell exports a PORT that the API would
      // otherwise inherit (process.env.PORT ?? 4000), breaking the health check.
      // DATABASE_URL: Task 10 — the API boots PostgresSaver on its own hermetic
      // DB, created by globalSetup above (NOT the shared slate / slate_test_*).
      env: {
        FAKE_PROVIDER: "1",
        DATABASE_URL: "postgres://slate:slate@localhost:5432/slate_test_e2e",
        PORT: "4000",
      },
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 120_000,
      // HOST pinned for symmetry with PORT — the ambient shell already exports a
      // surprising PORT, so don't trust it for the host either.
      env: { NEXT_PUBLIC_API_URL: "http://localhost:4000", HOST: "127.0.0.1" },
    },
  ],
});
