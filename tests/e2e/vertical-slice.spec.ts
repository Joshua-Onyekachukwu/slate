import { test, expect, type Page } from "@playwright/test";

// Task 8 Step 1 — executed in Task 10 (E2E + full verification).
// Playwright boots the API (:4000, FAKE_PROVIDER=1, fresh data/e2e.db) and web (:3000)
// via the webServer array in tests/playwright.config.ts.
// Full journey: idea → research gate → approve → script gate → approve →
// storyboard gate v1 → REGENERATE with feedback → gate v2 ("(rev)" titles) →
// per-scene edit (→ v3) → prompt regen (→ v4) → manual pack edit (→ v5) →
// DRAG-REORDER scene 1 below scene 3 (→ v6, survives reload) → approve → done.
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
    // ERR_ABORTED is benign (StrictMode/navigation); ERR_BLOCKED_BY_ORB on the
    // external font CDNs is also benign — Chromium blocks the cross-origin font
    // CSS when the CDN serves invalid CORS headers (a third-party response the
    // app can't control), and the app falls back to system fonts.
    if (errText.includes("ERR_ABORTED")) return;
    if (errText.includes("ERR_BLOCKED_BY_ORB") && /fontshare|fonts\.googleapis/.test(req.url())) return;
    errors.push(`requestfailed: ${req.url()} ${errText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && !res.url().includes("/favicon")) {
      errors.push(`http ${res.status()}: ${res.url()}`);
    }
  });
  return errors;
}

test("idea → script gate → storyboard gate (regenerate + edit + drag-reorder) → approve (no console errors)", async ({ page }) => {
  const errors = await trackErrors(page);

  await page.goto("/studio"); // the studio (dashboard) moved from / to /studio — / is the public landing
  await page.getByLabel("Describe your video idea").fill("A documentary about the history of the universe");
  await page.getByRole("button", { name: /begin production/i }).click();
  await page.waitForURL(/\/projects\//);

  // Block 2: the workflow pauses at the RESEARCH gate first (brief → researchAgent
  // → research_review). The packet renders in the workspace; approve it to reach
  // the script gate.
  await expect(page.getByText(/research · awaiting review/i)).toBeVisible();
  await expect(page.getByText(/13\.8 bya: Big Bang/i)).toBeVisible();
  await expect(page.getByText(/nasa · esa/i)).toBeVisible(); // references
  await page.getByRole("button", { name: /approve & continue/i }).click();

  // Research approved → the script gate (FakeProvider scripted sequence:
  // script → low scores). The workspace shows the script on paper with scores.
  await expect(page.getByText(/overall/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /approve & continue/i })).toBeVisible();

  // Approve the script → the storyboard stage generates (scenes + prompt packs)
  // and pauses at the storyboard gate v1 (plain titles). The scene list renders
  // as slate lines.
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page.getByTestId("scene-card-1")).toBeVisible();
  await expect(page.getByText(/scenes storyboarded/i)).toBeVisible();

  // The crew sheet ALSO renders in the coverage rail during storyboard review
  // (prototype's Consistency-records card) — not just at the locked plan. The
  // characters/locations persist on the project row when the script is
  // approved (queue: CHARACTERS/LOCATIONS), so they show at the gate.
  await expect(page.getByText(/consistency records/i)).toBeVisible();
  await expect(page.getByText(/the narrator/i)).toBeVisible();
  await expect(page.getByText(/the observable universe/i)).toBeVisible();

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

  // MANUAL prompt-pack EDIT through the real UI: the Advanced panel's Edit
  // mode exposes the pack as editable fields; saving PUTs the edited pack back
  // as new version rows (direct-DB write, no provider queue consumed) → v5.
  await page.getByRole("button", { name: /edit pack for scene 1/i }).click();
  const imagePrompt = page.getByLabel("Image prompt");
  await expect(imagePrompt).toBeVisible();
  await imagePrompt.fill("MANUAL EDIT: tungsten-lit nebula, no text");
  await page.getByRole("button", { name: /save pack for scene 1/i }).click();
  await expect(page.getByText(/MANUAL EDIT: tungsten-lit nebula, no text/i)).toBeVisible();
  await expect(page.getByText(/scenes · sb v5/i)).toBeVisible();

  // DRAG-TO-REORDER through the real UI — closes the drag-only-verified-via-curl
  // gap (the reorder endpoint had E2E coverage only through the API inject/curl
  // tests, never through the browser gesture). Scene 1 (index 0) is dragged
  // BELOW scene 3 (drop in scene 3's bottom half → moveScene(0, 2) →
  // [S2, S3, S1]). Like the edit, this is a direct-DB write, so it consumes NO
  // provider queue — the 28-entry exhaustion contract is untouched. It bumps the
  // whole storyboard version v5 → v6 (new version rows, per spec §12.9).
  //
  // HTML5 DnD: SceneCard is `draggable` and reads dataTransfer.getData in its
  // onDrop. Playwright's locator.dragTo does not reliably round-trip the
  // dataTransfer through React's synthetic events, so dispatch the native drag
  // sequence with a REAL DataTransfer — the exact handlers a user drag fires.
  const dragScene1BelowScene3 = () =>
    page.evaluate(() => {
      const source = document.querySelector("[data-testid=\"scene-card-1\"]");
      const target = document.querySelector("[data-testid=\"scene-card-3\"]");
      if (!source || !target) throw new Error("scene cards not found for drag");
      const rect = target.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height * 0.85; // bottom half → below = true
      const dt = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX, clientY }));
    });

  // Sanity: the gate holds the storyboard at v5 with (rev) titles in order.
  await expect(page.getByTestId("scene-card-1")).toContainText("Scene 1 (rev)");
  await expect(page.getByTestId("scene-card-3")).toContainText("Scene 3 (rev)");
  await dragScene1BelowScene3();
  // Optimistic move + PUT round-trip → new version rows; card ORDER follows the
  // scene order prop, so scene-card-1 now holds the former Scene 2.
  await expect(page.getByText(/scenes · sb v6/i)).toBeVisible();
  await expect(page.getByTestId("scene-card-1")).toContainText("Scene 2 (rev)");
  await expect(page.getByTestId("scene-card-3")).toContainText("Scene 1 (rev)");

  // RELOAD: the reorder must come back from the DB (new version rows), not from
  // client state — the whole point of the version-rows persistence contract.
  await page.reload();
  await expect(page.getByText(/scenes · sb v6/i)).toBeVisible();
  await expect(page.getByTestId("scene-card-1")).toContainText("Scene 2 (rev)");
  await expect(page.getByTestId("scene-card-3")).toContainText("Scene 1 (rev)");

  // Approve the storyboard → production plan locked (done).
  await page.getByRole("button", { name: /approve & continue/i }).click();
  await expect(page.getByText(/production plan locked/i)).toBeVisible();

  // Third persistence proof: the approved production plan's "Scenes in order"
  // section reflects the DRAGGED sequence (SC 01 = the former Scene 2) — the
  // reorder survives all the way into the locked plan, not just the storyboard
  // view and the reload.
  await expect(page.locator(".plan-section .plan-row").first()).toContainText("Scene 2 (rev)");
  await expect(page.locator(".plan-section .plan-row").nth(2)).toContainText("Scene 1 (rev)");

  // The crew sheet renders the consistency records extracted after script
  // approval (queue: CHARACTERS/LOCATIONS) — the done view's source of truth.
  // Scoped to the crew-sheet section: the coverage rail now ALSO shows the
  // Consistency records card (same names), so an unscoped getByText would hit
  // two elements (strict-mode violation).
  const crewSheet = page.locator(".plan-section", { hasText: /crew sheet — consistency/i });
  await expect(crewSheet).toBeVisible();
  await expect(crewSheet.getByText(/the narrator/i)).toBeVisible();
  await expect(crewSheet.getByText(/the observable universe/i)).toBeVisible();

  // Definition of done: no console/page errors anywhere in the flow.
  expect(errors).toEqual([]);
});
