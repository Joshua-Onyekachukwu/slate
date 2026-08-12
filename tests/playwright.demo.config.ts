import { defineConfig } from "@playwright/test";

// DEMO-QUEUE smoke (demo-smoke.spec.ts) — a sibling of the main
// playwright.config.ts that boots the SAME stack with DEMO_QUEUE=1 so the
// demo's scripted journey (research gate → script 2/5 → retake → 4/5 →
// approve → storyboard gate) runs as an automated smoke:
//
//   - API on :4002 with FAKE_PROVIDER=1 DEMO_QUEUE=1 → provider.ts returns the
//     scripted demo queue: project 1 pauses at the research gate, the script
//     comes back at 2/5, the retake at 4/5, then consistency + storyboard v1.
//   - web on :3000 pointing at that API (no Clerk keys → demo mode, studio
//     renders directly).
//
// Separate hermetic DB (slate_test_demo) + port so this run never touches the
// main E2E database, its FakeProvider queue position, or the auth run.
const API_PORT = 4002;
const DEMO_DATABASE_URL = "postgres://slate:slate@localhost:5432/slate_test_demo";
// globalSetup reads E2E_DATABASE_URL (default slate_test_e2e) — point it at the
// demo DB. globalSetup runs in this same process, after the config loads.
process.env.E2E_DATABASE_URL = DEMO_DATABASE_URL;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /demo-smoke\.spec\.ts/,
  globalSetup: "./global-setup.ts",
  // The demo queue is one FakeProvider instance shared by every request in the
  // run — sequential execution keeps consumption deterministic.
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:3000",
    expect: { timeout: 15_000 },
  },
  webServer: [
    {
      command: "pnpm --filter api start",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        FAKE_PROVIDER: "1",
        DEMO_QUEUE: "1",
        DATABASE_URL: DEMO_DATABASE_URL,
        PORT: String(API_PORT),
      },
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
        HOST: "127.0.0.1",
      },
    },
  ],
});
