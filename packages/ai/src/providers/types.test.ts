import { describe, it, expect } from "vitest";
import { FakeProvider } from "./fake";
import { z } from "zod";

describe("FakeProvider", () => {
  it("returns the next scripted output and validates schema", async () => {
    const p = new FakeProvider([{ content: '{"topic":"universe"}' }]);
    const schema = z.object({ topic: z.string() });
    const res = await p.complete({ messages: [{ role: "user", content: "hi" }], schema });
    expect(res.output).toEqual({ topic: "universe" });
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
