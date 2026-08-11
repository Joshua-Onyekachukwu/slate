import { defineConfig } from "@playwright/test";

// Enforced-mode auth E2E (Task 2, ADR-022/023) — a sibling of the main
// playwright.config.ts that boots BOTH servers with auth ON:
//
//   - API on :4001 with STUB_AUTH=1  → index.ts installs makeStubVerifyToken():
//     fixed bearer tokens ("stub-token-a"/"stub-token-b") map to fixed user
//     ids, everything else 401s. No Clerk network access, fully hermetic.
//   - web on :3000 with fake-but-WELL-FORMED Clerk keys → authEnabled=true, so
//     the middleware protects routes and ClerkProvider mounts. The keys decode
//     to a real-looking instance (slate-stub.clerk.accounts.dev) that never
//     resolves; the no-session redirect needs no network, and the dashboard is
//     unreachable without a session anyway (the "works with a token" leg is
//     asserted at the API contract where the token actually lives).
//
// Separate hermetic DB (slate_test_auth) so this run never touches the main
// E2E database or its FakeProvider queue position.
const API_PORT = 4001;
const AUTH_DATABASE_URL = "postgres://slate:slate@localhost:5432/slate_test_auth";
// globalSetup reads E2E_DATABASE_URL (default slate_test_e2e) — point it at the
// auth DB. globalSetup runs in this same process, after the config loads.
process.env.E2E_DATABASE_URL = AUTH_DATABASE_URL;

// v7 key format: pk_test_<unpadded base64(frontendApi + "$")> — validated by
// @clerk/shared parsePublishableKey at middleware init (no "$" → boot fails).
// Decodes to slate-stub.clerk.accounts.dev (never resolves — no network needed
// for the no-session redirect). The secret key only needs to be non-empty
// (assertValidSecretKey) and is never consulted without a session cookie.
const FAKE_PK = "pk_test_c2xhdGUtc3R1Yi5jbGVyay5hY2NvdW50cy5kZXYk";
const FAKE_SK = "sk_test_e2Uta2V5LXJhbmRvbS1ieXRlcy1mb3ItdGhlLXN0dWItc2VjcmV0";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /auth\.spec\.ts/,
  globalSetup: "./global-setup.ts",
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
        STUB_AUTH: "1",
        DATABASE_URL: AUTH_DATABASE_URL,
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
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: FAKE_PK,
        CLERK_SECRET_KEY: FAKE_SK,
        // Stub mode on the web too: the middleware uses a plain redirect
        // instead of clerkMiddleware (whose signed-out handshake bounces to
        // the unresolvable fake instance rather than /sign-in).
        STUB_AUTH: "1",
      },
    },
  ],
});
