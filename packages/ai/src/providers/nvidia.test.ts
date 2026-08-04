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
});
