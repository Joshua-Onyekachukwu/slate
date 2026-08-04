import { describe, it, expect } from "vitest";
import { promptAgent } from "./prompts";
import { FakeProvider } from "../providers/fake";

describe("promptAgent", () => {
  it("generates a five-part prompt pack for a scene", async () => {
    const p = new FakeProvider([
      { content: '{"imagePrompt":"still","videoPrompt":"move","narrationPrompt":"voice","musicPrompt":"score","sfxPrompt":"boom"}' },
    ]);
    const scene = { title: "The Bang", narration: "n", visualDescription: "v", cameraDirection: "c", durationSeconds: 8, transition: "CUT", musicCue: "m" };
    const pack = await promptAgent(p, scene, [], []);
    expect(pack).toHaveProperty("imagePrompt");
    expect(pack).toHaveProperty("sfxPrompt");
  });
});
