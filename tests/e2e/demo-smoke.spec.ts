import { test, expect, type Page } from "@playwright/test";

// DEMO-QUEUE smoke - an automated capture of the demo's scripted journey,
// driven through the real UI against the exact stack the demo uses
// (playwright.demo.config.ts boots the API with FAKE_PROVIDER=1 DEMO_QUEUE=1).
//
// The demo queue scripts project 1 as: brief → researchAgent → RESEARCH gate →
// (approve) → script 2/5 → (reject) → script v2 4/5 → (approve) → consistency
// + storyboard v1 gate. The STORYBOARD APPROVE is checkpoint-only (consumes
// nothing), so this spec drives through it: clicking "Approve & continue"
// locks the production plan and the workspace lands on the film panel, ready
// for the demo user to export their cut.
async function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  // 4xx/5xx responses (Next dev 404s /favicon.ico benignly; allowlist it).
  // ERR_ABORTED is benign (StrictMode double-effects + navigation).
  page.on("requestfailed", (req) => {
    const errText = req.failure()?.errorText ?? "";
    if (errText.includes("ERR_ABORTED")) return;
    errors.push(`requestfailed: ${req.url()} ${errText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("/favicon")) {
      // The workspace auto-renders the first cut when the plan locks; without
      // FFmpeg installed the render route 501s (RENDER_UNAVAILABLE) by contract
      // and the film panel surfaces it as a failed take - a benign, expected
      // demo-state error, not a journey defect.
      if (res.status() === 501 && res.url().includes("/render")) return;
      errors.push(`http ${res.status()}: ${res.url()}`);
    }
  });
  return errors;
}

test("demo journey: research gate → script v1 (2/5) → retake → v2 (4/5) → approve → storyboard gate (no console errors)", async ({ page }) => {
  const errors = await trackErrors(page);

  // Exactly ONE project may be created - a double-create (landing + studio
  // path) would add TWO and desync the scripted demo queue. The demo DB
  // persists across runs (ensureDatabase is create-if-missing), so assert the
  // DELTA, not an absolute count. API base = the demo config's pinned port
  // (playwright.demo.config.ts).
  const listProjects = async () => {
    const res = await page.request.get("http://localhost:4002/api/v1/projects");
    expect(res.status()).toBe(200);
    return ((await res.json()) as { projects: unknown[] }).projects;
  };
  const before = (await listProjects()).length;

  // Idea → the LANDING's "Begin production" creates the project and navigates
  // to ITS workspace. Regression: it used to only route to /studio, dropping
  // the typed idea and inviting a second create that double-consumed the FIFO
  // demo queue (the landing/studio double-create defect). The workflow then
  // pauses at the RESEARCH gate (brief cards + research packet rendered).
  await page.goto("/");
  await page.getByLabel("Type your video idea").fill("A documentary about a runner's first marathon");
  await page.getByRole("button", { name: /begin production/i }).click();
  await page.waitForURL(/\/projects\//);
  const after = (await listProjects()).length;
  expect(after).toBe(before + 1);

  await expect(page.getByText(/research · awaiting review/i)).toBeVisible();
  await expect(page.getByText(/creative brief/i)).toBeVisible();
  await expect(page.getByText("A runner's first marathon", { exact: true })).toBeVisible(); // brief topic card
  await expect(page.getByText(/6:00 am: the start line/i)).toBeVisible(); // research timeline
  await page.getByRole("button", { name: /approve & continue/i }).click();

  // Research approved → the script gate with the LOW scores (2/5) first take.
  await expect(page.getByText(/script · awaiting review/i)).toBeVisible();
  await expect(page.getByText("The First Marathon")).toBeVisible();
  await expect(page.getByText(/overall/i)).toBeVisible();
  await expect(page.getByText("2").first()).toBeVisible();
  await expect(page.getByText(/needs a stronger hook/i)).toBeVisible();

  // Reject the 2/5 script with feedback → the retake lands at 4/5 (stronger
  // hook), Script v2.
  await page.getByLabel("Retake feedback").fill("Make the hook more evocative");
  await page.getByRole("button", { name: /^regenerate$/i }).click();
  // The retake's UNIQUE content is the v2 proof (same approach as the E2E
  // suite - assert content, not the rail's split version nodes): the new hook
  // and the "stronger hook now" note only exist on the 4/5 retake.
  await expect(page.getByText("Before the start gun, there was one idea - to finish.")).toBeVisible();
  await expect(page.getByText(/stronger hook now/i)).toBeVisible();
  await expect(page.getByText("OVERALL")).toBeVisible();
  await expect(page.getByText(/4/).first()).toBeVisible();

  // Approve the 4/5 script → consistency (characters/locations) runs, then the
  // storyboard lands at gate v1 (plain titles, sb v1).
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page.getByTestId("scene-card-1")).toBeVisible();
  await expect(page.getByTestId("scene-card-1")).toContainText("The cold open");
  await expect(page.getByText(/scenes · sb v1/i)).toBeVisible();
  await expect(page.getByText(/consistency records/i)).toBeVisible(); // crew sheet in the rail
  await expect(page.getByText(/maya/i)).toBeVisible();
  await expect(page.getByText(/the start line/i)).toBeVisible();

  // Scripted storyboard-approve path: the demo user clicks Approve & continue
  // and the plan locks (checkpoint-only - the queue is untouched), landing on
  // the film panel with the export surface ready. The workspace auto-renders
  // the first cut on lock; without FFmpeg installed that attempt 501s
  // (RENDER_UNAVAILABLE), which trackErrors allowlists above - the film panel
  // surfaces it as a failed take and the export button stays ready.
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page.getByText(/production plan locked/i)).toBeVisible();
  await expect(page.getByText(/THE FILM/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /export film/i })).toBeVisible();

  // Definition of done: no console/page/network errors anywhere in the journey.
  expect(errors).toEqual([]);
});
