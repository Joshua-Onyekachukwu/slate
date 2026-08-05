import { test, expect, type Page } from "@playwright/test";

// Task 8 Step 1 — executed in Task 10 (E2E + full verification).
// Playwright boots the API (:4000, FAKE_PROVIDER=1, fresh data/e2e.db) and web (:3000)
// via the webServer array in tests/playwright.config.ts.
async function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  // Network failures the app might swallow without console.error — plus 4xx/5xx
  // responses (Next dev 404s /favicon.ico benignly; allowlist it). Aborted
  // requests (ERR_ABORTED) are benign — React StrictMode double-effects abort the
  // first EventSource on cleanup, and navigation cancels in-flight fetches.
  page.on("requestfailed", (req) => {
    const errText = req.failure()?.errorText ?? "";
    if (!errText.includes("ERR_ABORTED")) errors.push(`requestfailed: ${req.url()} ${errText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("/favicon")) {
      errors.push(`http ${res.status()}: ${res.url()}`);
    }
  });
  return errors;
}

test("idea → script gate → storyboard gate → approve (no console errors)", async ({ page }) => {
  const errors = await trackErrors(page);

  await page.goto("/");
  await page.getByLabel("Describe your video idea").fill("A documentary about the history of the universe");
  await page.getByRole("button", { name: /begin production/i }).click();
  await page.waitForURL(/\/projects\//);

  // POST /projects ran the workflow to the script gate (FakeProvider scripted sequence):
  // brief → script → low scores. The workspace shows the script on paper with scores.
  await expect(page.getByText(/overall/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /approve & continue/i })).toBeVisible();

  // Approve the script → the storyboard stage generates (scenes + prompt packs)
  // and pauses at the storyboard gate. The scene list renders as slate lines.
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page.getByTestId("scene-card-1")).toBeVisible();
  await expect(page.getByText(/scenes storyboarded/i)).toBeVisible();

  // Approve the storyboard → production plan locked (done).
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page.getByText(/production plan locked/i)).toBeVisible();

  // Definition of done: no console/page errors anywhere in the flow.
  expect(errors).toEqual([]);
});
