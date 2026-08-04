import { test, expect } from "@playwright/test";

// Task 8 Step 1 — checked in now, executed in Task 10 (E2E + full verification).
// Requires: API on :4000 with FAKE_PROVIDER=1, web on :3000, both from a fresh
// data/e2e.db.
test("idea → approved script flow", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Describe your video idea").fill("A documentary about the history of the universe");
  await page.getByRole("button", { name: /begin production/i }).click();
  await page.waitForURL(/\/projects\//);
  // POST /projects ran the workflow to the script gate (FakeProvider scripted in test env):
  await expect(page.getByText(/overall/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /approve & continue/i })).toBeVisible();
  await page.getByRole("button", { name: /approve & continue/i }).click();
  // script approved → done
  await expect(page.getByText(/approved/i).first()).toBeVisible();
});
