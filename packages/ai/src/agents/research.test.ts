import { describe, it, expect } from "vitest";
import { researchAgent } from "./research";
import { FakeProvider } from "../providers/fake";

describe("researchAgent", () => {
  it("returns a research packet from the brief", async () => {
    const p = new FakeProvider([
      { content: '{"timeline":["13.8 bya: Big Bang"],"concepts":["inflation"],"terminology":{},"references":["NASA"],"keyEvents":["first stars"]}' },
    ]);
    const brief = { topic: "universe", audience: "general", platform: "youtube", style: "documentary", durationSeconds: 270, tone: "wonder", narration: "male", aspectRatio: "16:9" };
    const packet = await researchAgent(p, brief);
    expect(packet.timeline[0]).toContain("Big Bang");
  });
  it("includes revision feedback in the provider input when provided", async () => {
    const p = new FakeProvider([
      { content: '{"timeline":["corrected"],"concepts":[],"terminology":{},"references":[],"keyEvents":[]}' },
    ]);
    const brief = { topic: "universe", audience: "general", platform: "youtube", style: "documentary", durationSeconds: 270, tone: "wonder", narration: "male", aspectRatio: "16:9" };
    await researchAgent(p, brief, "add sources");
    const lastUser = p.lastInput.messages[p.lastInput.messages.length - 1].content;
    expect(lastUser).toContain("add sources");
  });
});
