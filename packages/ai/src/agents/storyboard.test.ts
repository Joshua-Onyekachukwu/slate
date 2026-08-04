import { describe, it, expect } from "vitest";
import { storyboardAgent } from "./storyboard";
import { FakeProvider } from "../providers/fake";

describe("storyboardAgent", () => {
  it("turns a script into ordered scenes", async () => {
    const p = new FakeProvider([
      { content: '[{"title":"The Bang","narration":"In the beginning…","visualDescription":"Light floods","cameraDirection":"Push-in","durationSeconds":8,"transition":"CUT","musicCue":"Drone"}]' },
    ]);
    const script = { title: "T", hook: "H", introduction: "I", body: ["B"], conclusion: "C", cta: null };
    const scenes = await storyboardAgent(p, script, [], []);
    expect(scenes[0].title).toBe("The Bang");
    expect(scenes[0].durationSeconds).toBe(8);
  });
});
