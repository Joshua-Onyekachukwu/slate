import { test, expect } from "@playwright/test";

// Enforced-mode auth E2E (Task 2, ADR-022/023) - runs under
// playwright.auth.config.ts, which boots the API (:4001, STUB_AUTH=1) and web
// (:3000, fake-but-well-formed Clerk keys so authEnabled=true) on the hermetic
// slate_test_auth DB.
//
// The stub verifier (apps/api/src/auth.ts) maps "stub-token-a" → user_stub_a
// and "stub-token-b" → user_stub_b; any other/missing token 401s. This proves
// the full contract hermetic: 401 without a token, the app works WITH one, and
// multi-user isolation (B can never see A's rows - 404, not 403).
const API = "http://localhost:4001";
const TOKEN_A = "stub-token-a";
const TOKEN_B = "stub-token-b";

test.describe("enforced auth mode", () => {
  test("API 401s without a token and rejects unknown tokens", async ({ request }) => {
    // No Authorization header → 401, not a leak of data or a 500.
    const noToken = await request.get(`${API}/api/v1/projects`);
    expect(noToken.status()).toBe(401);
    expect((await noToken.json()).error.code).toBe("UNAUTHORIZED");
    expect((await noToken.json()).error.message).toBe("missing bearer token");

    // A token the stub verifier doesn't know → 401 "invalid token".
    const garbage = await request.get(`${API}/api/v1/projects`, {
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(garbage.status()).toBe(401);
    expect((await garbage.json()).error.code).toBe("UNAUTHORIZED");
    expect((await garbage.json()).error.message).toBe("invalid token");
  });

  test("API works with a stub token and isolates users", async ({ request }) => {
    // User A creates a project → 201, owned by user_stub_a, workflow runs to
    // its first gate (the research review) exactly as in local mode.
    const create = await request.post(`${API}/api/v1/projects`, {
      headers: { authorization: `Bearer ${TOKEN_A}` },
      data: { idea: "auth e2e project" },
    });
    expect(create.status()).toBe(201);
    const project = (await create.json()).project as { id: string; ownerId: string; stage: string };
    expect(project.id).toBeTruthy();
    expect(project.ownerId).toBe("user_stub_a");
    expect(project.stage).toBeTruthy();

    // A can list and fetch it.
    const listA = await request.get(`${API}/api/v1/projects`, {
      headers: { authorization: `Bearer ${TOKEN_A}` },
    });
    expect(listA.status()).toBe(200);
    const idsA = ((await listA.json()).projects as { id: string }[]).map((p) => p.id);
    expect(idsA).toContain(project.id);

    // B is isolated: B's list is empty and B's GET of A's project is a 404
    // (never 403 - no existence leak, per api-design.md).
    const listB = await request.get(`${API}/api/v1/projects`, {
      headers: { authorization: `Bearer ${TOKEN_B}` },
    });
    expect(listB.status()).toBe(200);
    expect(((await listB.json()).projects as unknown[]).length).toBe(0);

    const getB = await request.get(`${API}/api/v1/projects/${project.id}`, {
      headers: { authorization: `Bearer ${TOKEN_B}` },
    });
    expect(getB.status()).toBe(404);
    expect((await getB.json()).error.code).toBe("NOT_FOUND");
  });

  test("web: / is public, /studio redirects to /sign-in without a session", async ({ page }) => {
    // The landing page is the public marketing face - it renders with no
    // session (the studio moved from / to /studio; only the app is protected).
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /type an idea/i })).toBeVisible();
    await expect(page.getByLabel("Type your video idea")).toBeVisible();

    // The studio is protected: without a session, /studio bounces to the
    // sign-in screen (the web half of "401s without a token").
    await page.goto("/studio");
    await expect(page).toHaveURL(/\/sign-in$/);

    // The Cutting Room auth card renders - brand + mode label (the shell is
    // plain HTML; Clerk's <SignIn/> never reaches the fake instance). Scoped to
    // the card: the nav brand also reads "slate", which would trip strict mode.
    await expect(page.getByText("sign in · cutting room")).toBeVisible();
    await expect(page.getByRole("main").getByText("slate", { exact: true })).toBeVisible();
  });
});
