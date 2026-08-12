import { test, expect, type Page } from "@playwright/test";

// DEMO-QUEUE smoke — an automated capture of the demo's scripted journey,
// driven through the real UI against the exact stack the demo uses
// (playwright.demo.config.ts boots the API with FAKE_PROVIDER=1 DEMO_QUEUE=1).
//
// The demo queue scripts project 1 as: brief → researchAgent → RESEARCH gate →
// (approve) → script 2/5 → (reject) → script v2 4/5 → (approve) → consistency
// + storyboard v1 gate. This spec asserts THAT path end to end, then stops at
// the storyboard gate (the approve that locks the plan is the E2E suite's
// territory — its queue scripts the storyboard retake instead).
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
      errors.push(`http ${res.status()}: ${res.url()}`);
    }
  });
  return errors;
}

test("demo journey: research gate → script v1 (2/5) → retake → v2 (4/5) → approve → storyboard gate (no console errors)", async ({ page }) => {
  const errors = await trackErrors(page);

  // Idea → the studio creates the project and the workflow pauses at the
  // RESEARCH gate (brief cards + research packet rendered).
  await page.goto("/studio");
  await page.getByLabel("Describe your video idea").fill("A documentary about the history of the universe");
  await page.getByRole("button", { name: /begin production/i }).click();
  await page.waitForURL(/\/projects\//);

  await expect(page.getByText(/research · awaiting review/i)).toBeVisible();
  await expect(page.getByText(/creative brief/i)).toBeVisible();
  await expect(page.getByText("History of the universe", { exact: true })).toBeVisible(); // brief topic card
  await expect(page.getByText(/13\.8 bya: Big Bang/i)).toBeVisible(); // research timeline
  await page.getByRole("button", { name: /approve & continue/i }).click();

  // Research approved → the script gate with the LOW scores (2/5) first take.
  await expect(page.getByText(/script · awaiting review/i)).toBeVisible();
  await expect(page.getByText("The First Three Minutes")).toBeVisible();
  await expect(page.getByText(/overall/i)).toBeVisible();
  await expect(page.getByText("2").first()).toBeVisible();
  await expect(page.getByText(/needs a stronger hook/i)).toBeVisible();

  // Reject the 2/5 script with feedback → the retake lands at 4/5 (stronger
  // hook), Script v2.
  await page.getByLabel("Retake feedback").fill("Make the hook more evocative");
  await page.getByRole("button", { name: /^regenerate$/i }).click();
  // The retake's UNIQUE content is the v2 proof (same approach as the E2E
  // suite — assert content, not the rail's split version nodes): the new hook
  // and the "stronger hook now" note only exist on the 4/5 retake.
  await expect(page.getByText("Before the first light, there was an idea — and you are its echo.")).toBeVisible();
  await expect(page.getByText(/stronger hook now/i)).toBeVisible();
  await expect(page.getByText("OVERALL")).toBeVisible();
  await expect(page.getByText(/4/).first()).toBeVisible();

  // Approve the 4/5 script → consistency (characters/locations) runs, then the
  // storyboard lands at gate v1 (plain titles, sb v1).
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page.getByTestId("scene-card-1")).toBeVisible();
  await expect(page.getByTestId("scene-card-1")).toContainText("Scene 1");
  await expect(page.getByText(/scenes · sb v1/i)).toBeVisible();
  await expect(page.getByText(/consistency records/i)).toBeVisible(); // crew sheet in the rail
  await expect(page.getByText(/the narrator/i)).toBeVisible();
  await expect(page.getByText(/the observable universe/i)).toBeVisible();

  // Definition of done: no console/page/network errors anywhere in the journey.
  expect(errors).toEqual([]);
});
