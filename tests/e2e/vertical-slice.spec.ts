import { test, expect, type Page } from "@playwright/test";

// Task 8 Step 1 — executed in Task 10 (E2E + full verification).
// Playwright boots the API (:4000, FAKE_PROVIDER=1, fresh data/e2e.db) and web (:3000)
// via the webServer array in tests/playwright.config.ts.
// Full journey: idea → script gate → approve → storyboard gate v1 → REGENERATE
// with feedback → gate v2 ("(rev)" titles) → per-scene edit (→ v3) → approve → done.
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

test("idea → script gate → storyboard gate (regenerate + edit) → approve (no console errors)", async ({ page }) => {
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
  // and pauses at the storyboard gate v1 (plain titles). The scene list renders
  // as slate lines.
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page.getByTestId("scene-card-1")).toBeVisible();
  await expect(page.getByText(/scenes storyboarded/i)).toBeVisible();

  // Storyboard REGENERATE through the real UI: type retake feedback, hit
  // Regenerate → write_storyboard runs again (queue: REV_SCENES) → the gate
  // reopens at v2 with "(rev)" titles. This proves the reject path round-trips
  // a new storyboard version, not just a new script.
  await page.getByLabel("Retake feedback").fill("Make the scenes more evocative");
  await page.getByRole("button", { name: /^regenerate$/i }).click();
  // v2 lands at the gate: rev titles + the version chip (rail/call sheet also
  // show "sb v2", but the rev title is the unique content proof).
  await expect(page.getByTestId("scene-card-1")).toContainText("Scene 1 (rev)");
  await expect(page.getByText(/scenes · sb v2/i)).toBeVisible();

  // Per-scene edit through the real UI: edit scene 1's narration and save. This
  // is ALSO the regression guard for the @fastify/cors@11 PUT-preflight fix —
  // before it, the browser save would fail with "Method PUT is not allowed" and
  // the strict error gate below would catch the console error. The edit bumps
  // the storyboard version (direct-DB write, no provider queue consumed).
  await page.getByRole("button", { name: /edit scene 1/i }).click();
  const narration = page.getByLabel("Narration");
  await expect(narration).toBeVisible();
  await narration.fill("USER EDIT: the afterglow remembers");
  await page.getByRole("button", { name: /save scene/i }).click();
  // The score-chip "3 scenes · sb v3" is the unique version marker (the rail and
  // call sheet also show "sb v3"; the edit bumped v2 → v3 on top of the
  // regenerate's v1 → v2).
  await expect(page.getByText(/scenes · sb v3/i)).toBeVisible();

  // Per-scene PROMPT regeneration through the real UI: the edit nulled scene 1's
  // pack ("Prompt pack queued."), so regenerate just that pack from the Advanced
  // panel → whole-storyboard version bump (v4) with the fresh pack restored.
  // This is ALSO the regression guard for the POST preflight (same class as the
  // PUT CORS fix — POST is allowed by default, but the version-rows round-trip
  // and response-replaces-state wiring are the real assertions).
  await page.getByRole("button", { name: /advanced — prompt packs/i }).click();
  await expect(page.getByText(/prompt pack queued/i)).toBeVisible();
  await page.getByRole("button", { name: /regenerate prompts for scene 1/i }).click();
  await expect(page.getByText(/regenerated pack for scene 1/i)).toBeVisible();
  await expect(page.getByText(/scenes · sb v4/i)).toBeVisible();

  // Approve the storyboard → production plan locked (done).
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page.getByText(/production plan locked/i)).toBeVisible();

  // The crew sheet renders the consistency records extracted after script
  // approval (queue: CHARACTERS/LOCATIONS) — the done view's source of truth.
  await expect(page.getByText(/crew sheet — consistency/i)).toBeVisible();
  await expect(page.getByText(/the narrator/i)).toBeVisible();
  await expect(page.getByText(/the observable universe/i)).toBeVisible();

  // Definition of done: no console/page errors anywhere in the flow.
  expect(errors).toEqual([]);
});
