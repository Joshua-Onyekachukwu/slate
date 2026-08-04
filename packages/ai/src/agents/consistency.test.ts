import { describe, it, expect } from "vitest";
import { characterAgent, environmentAgent } from "./consistency";
import { FakeProvider } from "../providers/fake";

describe("consistency agents", () => {
  const brief = { topic: "universe", audience: "general", platform: "youtube", style: "documentary", durationSeconds: 270, tone: "wonder", narration: "male", aspectRatio: "16:9" };
  const script = { title: "T", hook: "H", introduction: "I", body: ["B"], conclusion: "C", cta: null };

  it("extracts characters with stable ids", async () => {
    const p = new FakeProvider([
      { content: '[{"id":"char-1","name":"The Narrator","description":"A calm voice guiding the journey"}]' },
    ]);
    const chars = await characterAgent(p, brief, script);
    expect(chars[0].id).toBe("char-1");
  });
  it("extracts locations", async () => {
    const p = new FakeProvider([
      { content: '[{"id":"loc-1","name":"The Observable Universe","description":"Vast and dark"}]' },
    ]);
    const locs = await environmentAgent(p, brief, script);
    expect(locs[0].name).toContain("Universe");
  });
});
