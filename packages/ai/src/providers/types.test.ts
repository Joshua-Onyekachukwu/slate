import { describe, it, expect } from "vitest";
import { FakeProvider } from "./fake";
import { NvidiaProvider } from "./nvidia";
import { z } from "zod";

describe("FakeProvider", () => {
  it("returns the next scripted output and validates schema", async () => {
    const p = new FakeProvider([{ content: '{"topic":"universe"}' }]);
    const schema = z.object({ topic: z.string() });
    const res = await p.complete({ messages: [{ role: "user", content: "hi" }], schema });
    expect(res.output).toEqual({ topic: "universe" });
  });
  // Phase 3 Block 1 — media generation is deterministic and hash-stable: the
  // same prompt → the same fake URL, different prompts → different URLs.
  it("generates deterministic media artifacts (hash-stable per prompt)", async () => {
    const p = new FakeProvider([]);
    const img1 = await p.generateImage({ prompt: "a nebula" });
    const img2 = await p.generateImage({ prompt: "a nebula" });
    const img3 = await p.generateImage({ prompt: "a supernova" });
    expect(img1.url).toMatch(/^fake:\/\/image\/[0-9a-f]{12}\.png$/);
    expect(img1.url).toBe(img2.url); // same prompt → same artifact
    expect(img3.url).not.toBe(img1.url); // different prompt → different artifact
    expect(img1.mimeType).toBe("image/png");
    const video = await p.generateVideo({ prompt: "push-in", durationSeconds: 12 });
    expect(video.url).toMatch(/^fake:\/\/video\//);
    expect(video.mimeType).toBe("video/mp4");
    const voice = await p.generateVoiceover({ text: "In the beginning" });
    expect(voice.url).toMatch(/^fake:\/\/voice\//);
    expect(voice.mimeType).toBe("audio/mpeg");
    const music = await p.generateMusic({ prompt: "low drone" });
    expect(music.url).toMatch(/^fake:\/\/music\//);
    expect(music.mimeType).toBe("audio/mpeg");
  });
  // Phase 3 Block 2 — the per-asset quality gate is deterministic and bounded:
  // same prompt → same score (retry idempotent), score within 1–5, notes set.
  it("scores every artifact deterministically (1–5, hash-stable)", async () => {
    const p = new FakeProvider([]);
    const a = await p.generateImage({ prompt: "a nebula" });
    const b = await p.generateImage({ prompt: "a nebula" });
    const c = await p.generateVideo({ prompt: "a nebula" });
    expect(a.quality?.score).toBe(b.quality?.score); // same prompt → same score
    expect(a.quality?.score).toBeGreaterThanOrEqual(1);
    expect(a.quality?.score).toBeLessThanOrEqual(5);
    expect(a.quality?.notes.length).toBeGreaterThan(0);
    expect(c.quality?.score).toBeGreaterThanOrEqual(1); // every kind is scored
    expect(c.quality?.score).toBeLessThanOrEqual(5);
  });
  it("throws when the queue is exhausted", async () => {
    const p = new FakeProvider([]);
    await expect(p.complete({ messages: [{ role: "user", content: "hi" }], schema: z.object({}) })).rejects.toThrow(/no scripted response/i);
  });
  it("exposes the last input for feedback assertions", async () => {
    const p = new FakeProvider([{ content: '{"topic":"universe"}' }]);
    await p.complete({ messages: [{ role: "user", content: "add sources" }], schema: z.object({ topic: z.string() }) });
    expect(p.lastInput.messages[p.lastInput.messages.length - 1].content).toContain("add sources");
  });
});

describe("NvidiaProvider media (Phase 3 Block 1)", () => {
  // Media endpoints are NOT wired yet — every method must fail with the typed
  // NOT_SUPPORTED error so the API can persist a failed asset row explicitly.
  const p = new NvidiaProvider({ apiKey: "sk-test", model: "nvidia/llama-3.3-70b" });
  it("throws NOT_SUPPORTED for every media method", async () => {
    await expect(p.generateImage({ prompt: "x" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(p.generateVideo({ prompt: "x" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(p.generateVoiceover({ text: "x" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(p.generateMusic({ prompt: "x" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });
});
