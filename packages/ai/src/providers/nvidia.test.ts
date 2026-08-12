import { describe, it, expect, vi, afterEach } from "vitest";
import { NvidiaProvider } from "./nvidia";
import { z } from "zod";

describe("NvidiaProvider", () => {
  afterEach(() => vi.restoreAllMocks());
  it("calls the OpenAI-compatible endpoint and returns parsed output", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"topic":"universe"}' } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const p = new NvidiaProvider({ apiKey: "k", model: "nvidia/llama-3.3-70b", baseUrl: "https://integrate.api.nvidia.com/v1" });
    const res = await p.complete({ messages: [{ role: "user", content: "make a brief" }], schema: z.object({ topic: z.string() }) });
    expect(res.output).toEqual({ topic: "universe" });
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
  });
  it("retries once on 429 then throws ProviderError(RATE_LIMITED)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) }).mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) }));
    const p = new NvidiaProvider({ apiKey: "k", model: "m", baseUrl: "http://x/v1" });
    await expect(p.complete({ messages: [], schema: z.object({}) })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  // ===== Phase 3 Block 3 — real NVIDIA media endpoints =====
  // Image generation goes through the OpenAI-compatible /images/generations
  // surface NVIDIA hosts on Build (documented NIM contract); the response is
  // either b64_json (default) or a url. Video/voice/music stay NOT_SUPPORTED:
  // NVIDIA's TTS is a gRPC service (grpc.nvcf.nvidia.com, approval-gated), and
  // no OpenAI-compatible video/music endpoint is verifiable on Build yet —
  // fabricated contracts would be defects.

  function stubFetch(results: unknown[]) {
    const fn = vi.fn();
    for (const r of results) fn.mockResolvedValueOnce(r);
    vi.stubGlobal("fetch", fn);
    return fn;
  }

  it("generateImage posts to /images/generations and parses b64_json into a data-URI artifact", async () => {
    const fetchMock = stubFetch([
      { ok: true, json: async () => ({ data: [{ b64_json: "QUJD" }] }) },
    ]);
    const p = new NvidiaProvider({ apiKey: "k", model: "m", baseUrl: "https://integrate.api.nvidia.com/v1" });
    const art = await p.generateImage({ prompt: "a nebula", aspectRatio: "16:9" });
    expect(art.url).toBe("data:image/png;base64,QUJD");
    expect(art.mimeType).toBe("image/png");
    expect(art.width).toBe(1280);
    expect(art.height).toBe(720);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/images/generations");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer k" });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      model: "stabilityai/stable-diffusion-3.5-large", prompt: "a nebula", size: "1280x720",
    });
  });

  it("generateImage accepts a returned url and skips the eval when disabled", async () => {
    const fetchMock = stubFetch([
      { ok: true, json: async () => ({ data: [{ url: "https://cdn.example/a.png" }] }) },
    ]);
    const p = new NvidiaProvider({ apiKey: "k", model: "m", baseUrl: "http://x/v1", evalEnabled: false });
    const art = await p.generateImage({ prompt: "p" });
    expect(art.url).toBe("https://cdn.example/a.png");
    expect(art.quality).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1); // no eval call
  });

  it("generateImage maps 429 to RATE_LIMITED and garbage bodies to INVALID_OUTPUT", async () => {
    const p = new NvidiaProvider({ apiKey: "k", model: "m", baseUrl: "http://x/v1", evalEnabled: false });
    stubFetch([{ ok: false, status: 429, json: async () => ({}) }, { ok: false, status: 429, json: async () => ({}) }]);
    await expect(p.generateImage({ prompt: "p" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    stubFetch([{ ok: true, json: async () => ({ data: [] }) }]);
    await expect(p.generateImage({ prompt: "p" })).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("generateImage runs a real quality eval through a vision model and attaches { score, notes }", async () => {
    // Image call returns b64; the eval call returns a JSON score card.
    const fetchMock = stubFetch([
      { ok: true, json: async () => ({ data: [{ b64_json: "QUJD" }] }) },
      { ok: true, json: async () => ({ choices: [{ message: { content: '{"score":4,"notes":["on-brief","sharp"]}' } }] }) },
    ]);
    const p = new NvidiaProvider({ apiKey: "k", model: "m", baseUrl: "http://x/v1" });
    const art = await p.generateImage({ prompt: "a nebula" });
    expect(art.quality).toEqual({ score: 4, notes: ["on-brief", "sharp"] });
    // The eval call went to chat/completions with the image as a data-URI content part.
    const [evalUrl, evalInit] = fetchMock.mock.calls[1];
    expect(String(evalUrl)).toContain("/chat/completions");
    const evalBody = JSON.parse((evalInit as RequestInit).body as string);
    expect(evalBody.model).toBe("meta/llama-3.2-90b-vision-instruct");
    const content = evalBody.messages[0].content as unknown[];
    expect(content[1]).toMatchObject({ type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } });
  });

  it("generateImage survives an eval failure without fabricating a score", async () => {
    stubFetch([
      { ok: true, json: async () => ({ data: [{ b64_json: "QUJD" }] }) },
      { ok: false, status: 500, json: async () => ({}) }, { ok: false, status: 500, json: async () => ({}) },
    ]);
    const p = new NvidiaProvider({ apiKey: "k", model: "m", baseUrl: "http://x/v1" });
    const art = await p.generateImage({ prompt: "p" });
    expect(art.url).toContain("data:image/png");
    expect(art.quality).toBeUndefined();
  });

  it("keeps video/voice/music as typed NOT_SUPPORTED (no verifiable OpenAI-compatible endpoint)", async () => {
    const p = new NvidiaProvider({ apiKey: "k", model: "m", baseUrl: "http://x/v1" });
    await expect(p.generateVideo({ prompt: "v" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(p.generateVoiceover({ text: "t" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
    await expect(p.generateMusic({ prompt: "m" })).rejects.toMatchObject({ code: "NOT_SUPPORTED" });
  });
});
