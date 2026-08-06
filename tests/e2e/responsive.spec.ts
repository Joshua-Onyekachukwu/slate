import { test, expect, type Page } from "@playwright/test";

// Formalizes the responsive pass: the Electron preview can't be script-resized,
// so desktop/tablet/mobile were verified by CSS logic. This spec renders real
// pixels at every breakpoint and fails on any horizontal overflow.
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 }, // between the 1180/880 console breakpoints
  { name: "mobile", width: 390, height: 844 },  // ≤640 mobile breakpoint
] as const;

const API = "http://localhost:4000";

// Horizontal overflow = content wider than the viewport. scrollWidth includes
// content pushed beyond the right edge; innerWidth is the full viewport incl.
// the scrollbar gutter, so a vertical scrollbar alone never trips this.
// Polls instead of a one-shot evaluate: the dashboard hydrates the project grid
// and the workspace refreshes via SSE, so the layout can change after goto — a
// single measure could pass before the populated layout settles.
async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: "page overflows the viewport horizontally after the layout settles",
    })
    .toBeLessThanOrEqual(0);
}

test.describe("dashboard viewports", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} (${vp.width}px) — no overflow, key elements visible`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await expectNoHorizontalOverflow(page);
      await expect(page.getByRole("link", { name: "SLATE" })).toBeVisible();
      await expect(page.getByRole("heading", { name: /what do you want to make/i })).toBeVisible();
      await expect(page.getByLabel("Describe your video idea")).toBeVisible();
      await expect(page.getByRole("button", { name: /begin production/i })).toBeVisible();
    });
  }
});

test.describe("workspace viewports", () => {
  // One project, created once (consumes the first GATE_BLOCK up to the research
  // gate: BRIEF + RESEARCH), shared by every stage below. The nested describes
  // advance it stage-by-stage via API in declaration order (workers: 1):
  //   brief/research gate → [3 viewports] → approve research (SCRIPT + SCORES)
  //   → script editor → [3 viewports] → approve script (APPROVE_BLOCK)
  //   → storyboard → [mobile]. See provider.ts for the deterministic queue
  //   contract — total stays GATE(4) + APPROVE(7) = 11.
  let projectId: string;

  test.beforeAll(async ({ playwright }) => {
    const req = await playwright.request.newContext({ baseURL: API });
    try {
      const res = await req.post("/api/v1/projects", { data: { idea: "viewport regression test" } });
      expect(res.ok(), `project create failed: ${res.status()} ${await res.text()}`).toBeTruthy();
      projectId = (await res.json()).project.id as string;
    } finally {
      await req.dispose();
    }
  });

  // BRIEF + RESEARCH GATE — the workflow pauses here with the approved creative
  // brief cards and the research packet rendered (Block 2 stage). No queue
  // consumption beyond the create above.
  test.describe("brief + research gate", () => {
    for (const vp of VIEWPORTS) {
      test(`${vp.name} (${vp.width}px) — brief cards + packet, no overflow`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`/projects/${projectId}`);
        await expectNoHorizontalOverflow(page);
        await expect(page.getByRole("tablist", { name: "Production stages" })).toBeVisible();
        await expect(page.getByText(/CREATIVE BRIEF/i)).toBeVisible();
        await expect(page.getByText("History of the universe")).toBeVisible(); // brief topic card
        // exact: the ws-meta line also contains "16:9 · documentary · …"
        await expect(page.getByText("16:9", { exact: true })).toBeVisible(); // aspect ratio card
        await expect(page.getByText(/13\.8 bya: Big Bang/i)).toBeVisible(); // research timeline
        await expect(page.getByRole("button", { name: /approve & continue/i })).toBeVisible();
      });
    }
  });

  // SCRIPT EDITOR — approve the research gate once (consumes SCRIPT + SCORES),
  // then the script renders on paper with review scores in the rail.
  test.describe("script editor", () => {
    test.beforeAll(async ({ playwright }) => {
      const req = await playwright.request.newContext({ baseURL: API });
      try {
        const res = await req.post(`/api/v1/projects/${projectId}/stages/research/approve`, {
          data: { approved: true },
        });
        expect(res.ok()).toBeTruthy();
      } finally {
        await req.dispose();
      }
    });

    for (const vp of VIEWPORTS) {
      test(`${vp.name} (${vp.width}px) — script on paper + scores, no overflow`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`/projects/${projectId}`);
        await expectNoHorizontalOverflow(page);
        await expect(page.getByRole("tablist", { name: "Production stages" })).toBeVisible();
        await expect(page.getByText("The First Three Minutes")).toBeVisible(); // script title
        await expect(page.getByText(/overall/i)).toBeVisible(); // score chip on the script
        await expect(page.getByRole("button", { name: /approve & continue/i })).toBeVisible();
      });
    }
  });

  // STORYBOARD — script already approved by the describe above; approve the
  // script gate once (consumes APPROVE_BLOCK) so the storyboard pass runs.
  test("mobile (390px) — storyboard view, no overflow, scene cards visible", async ({ page, playwright }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const req = await playwright.request.newContext({ baseURL: API });
    const res = await req.post(`/api/v1/projects/${projectId}/stages/script/approve`, {
      data: { approved: true },
    });
    expect(res.ok()).toBeTruthy();
    await req.dispose();

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId("scene-card-1")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: /approve & continue/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /advanced — prompt packs/i })).toBeVisible();
  });
});
